"""Kubernetes `AgentOrchestrator` implementation.

Creates one Pod + ClusterIP Service per project per role. PVCs for the wiki
and session store are created on first use and never deleted by `stop()` —
wiki pages must survive pod restarts.

The backend namespace is discovered from the service-account token file that
Kubernetes mounts into every pod, so agent Pods are always created in the same
namespace as the backend. No cross-namespace RBAC needed.

Bearer tokens are kept in memory only. A backend restart loses all tokens;
any active project must call `stop()` + `ensure_running()` to reissue.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import secrets as pysecrets
import time
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID

import httpx
import yaml
from kubernetes import client as k8s_client
from kubernetes import config as k8s_config
from kubernetes.client.rest import ApiException

from ttt.config import settings
from ttt.orchestrator.base import (
    AgentEndpoint,
    AgentOrchestrator,
    AgentSecrets,
    AgentStatus,
)

log = logging.getLogger("ttt.orchestrator.k8s")

AGENT_PORT = 8766
READY_TIMEOUT_S = 180.0
POLL_INTERVAL_S = 2.0
TERMINATE_TIMEOUT_S = 30.0
WIKI_PVC_SIZE = "5Gi"
SESSIONS_PVC_SIZE = "1Gi"

_SA_NS_FILE = Path("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
_TMPL_DIR = Path(__file__).parent / "pod_templates"


class KubernetesOrchestrator(AgentOrchestrator):
    """Drives the Kubernetes API to manage per-project agent pods.

    All Kubernetes API calls are synchronous (kubernetes-python SDK does not
    have native async support). They are wrapped with `asyncio.to_thread` to
    avoid blocking the event loop, matching the pattern in `DockerOrchestrator`.
    """

    def __init__(
        self,
        *,
        image: str,
        backend_url: str,
        storage_class: str = "",
    ) -> None:
        try:
            k8s_config.load_incluster_config()
            self._namespace = _SA_NS_FILE.read_text().strip()
        except k8s_config.ConfigException:
            # Running outside a cluster (local testing with a kubeconfig).
            k8s_config.load_kube_config()
            self._namespace = "default"

        log.info(
            "KubernetesOrchestrator ready: namespace=%s image=%s",
            self._namespace,
            image,
        )

        self._image = image
        self._backend_url = backend_url
        self._storage_class = storage_class

        # Per-project bearer tokens; one token shared across both role pods.
        self._tokens: dict[UUID, str] = {}
        # Cached endpoints keyed by (project_id, role).
        self._endpoints: dict[tuple[UUID, str], AgentEndpoint] = {}

        self._pod_tmpl: dict = yaml.safe_load((_TMPL_DIR / "pod.yaml").read_text())
        self._svc_tmpl: dict = yaml.safe_load((_TMPL_DIR / "service.yaml").read_text())
        self._pvc_tmpl: dict = yaml.safe_load((_TMPL_DIR / "pvc.yaml").read_text())

        self._v1 = k8s_client.CoreV1Api()

    # ── naming helpers ─────────────────────────────────────────────────────────

    def _pod_name(self, project_id: UUID, role: str) -> str:
        return f"ttt-agent-{project_id}-{role}"

    def _svc_name(self, project_id: UUID, role: str) -> str:
        return f"ttt-agent-{project_id}-{role}"

    def _wiki_pvc(self, project_id: UUID) -> str:
        return f"ttt-wiki-{project_id}"

    def _sessions_pvc(self, project_id: UUID, role: str) -> str:
        return f"ttt-sessions-{project_id}-{role}"

    def _agent_url(self, project_id: UUID, role: str) -> str:
        svc = self._svc_name(project_id, role)
        return f"http://{svc}.{self._namespace}.svc.cluster.local:{AGENT_PORT}"

    # ── spec builders ──────────────────────────────────────────────────────────

    def _build_env(
        self,
        project_id: UUID,
        role: str,
        token: str,
        secrets: AgentSecrets,
    ) -> list[dict]:
        env: dict[str, str] = {
            "TTT_PROJECT_ID": str(project_id),
            "TTT_BACKEND_URL": self._backend_url,
            "TTT_AGENT_TOKEN": token,
            "TTT_AGENT_ROLE": role,
            "TTT_CHAT_MODEL": settings.chat_model,
            "TTT_INGEST_MODEL": settings.ingest_model,
            "LOG_LEVEL": settings.log_level,
            **secrets.as_env(),
        }
        return [{"name": k, "value": v} for k, v in env.items()]

    def _build_pod_spec(
        self,
        project_id: UUID,
        role: str,
        token: str,
        secrets: AgentSecrets,
    ) -> dict:
        spec = copy.deepcopy(self._pod_tmpl)
        spec["metadata"]["name"] = self._pod_name(project_id, role)
        spec["metadata"]["namespace"] = self._namespace
        spec["metadata"]["labels"]["ttt.project_id"] = str(project_id)
        spec["metadata"]["labels"]["ttt.agent_role"] = role
        container = spec["spec"]["containers"][0]
        container["image"] = self._image
        container["env"] = self._build_env(project_id, role, token, secrets)
        # Wiki volume: RW for editor, RO for viewer.
        container["volumeMounts"][0]["readOnly"] = role != "editor"
        spec["spec"]["volumes"][0]["persistentVolumeClaim"]["claimName"] = (
            self._wiki_pvc(project_id)
        )
        spec["spec"]["volumes"][1]["persistentVolumeClaim"]["claimName"] = (
            self._sessions_pvc(project_id, role)
        )
        return spec

    def _build_svc_spec(self, project_id: UUID, role: str) -> dict:
        spec = copy.deepcopy(self._svc_tmpl)
        spec["metadata"]["name"] = self._svc_name(project_id, role)
        spec["metadata"]["namespace"] = self._namespace
        spec["spec"]["selector"]["ttt.project_id"] = str(project_id)
        spec["spec"]["selector"]["ttt.agent_role"] = role
        return spec

    def _build_pvc_spec(self, name: str, size: str) -> dict:
        spec = copy.deepcopy(self._pvc_tmpl)
        spec["metadata"]["name"] = name
        spec["metadata"]["namespace"] = self._namespace
        if self._storage_class:
            spec["spec"]["storageClassName"] = self._storage_class
        else:
            spec["spec"].pop("storageClassName", None)
        spec["spec"]["resources"]["requests"]["storage"] = size
        return spec

    # ── low-level K8s helpers (synchronous — called via to_thread) ─────────────

    def _find_pod(self, project_id: UUID, role: str):
        try:
            return self._v1.read_namespaced_pod(
                self._pod_name(project_id, role), self._namespace
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise

    def _ensure_pvc(self, name: str, size: str) -> None:
        try:
            self._v1.read_namespaced_persistent_volume_claim(name, self._namespace)
            return
        except ApiException as e:
            if e.status != 404:
                raise
        log.info("creating PVC %s/%s (%s)", self._namespace, name, size)
        self._v1.create_namespaced_persistent_volume_claim(
            self._namespace, self._build_pvc_spec(name, size)
        )

    def _ensure_service(self, project_id: UUID, role: str) -> None:
        name = self._svc_name(project_id, role)
        try:
            self._v1.read_namespaced_service(name, self._namespace)
            return
        except ApiException as e:
            if e.status != 404:
                raise
        log.info("creating Service %s/%s", self._namespace, name)
        self._v1.create_namespaced_service(
            self._namespace, self._build_svc_spec(project_id, role)
        )

    def _delete_pod(self, project_id: UUID, role: str, grace: int = 5) -> None:
        name = self._pod_name(project_id, role)
        try:
            self._v1.delete_namespaced_pod(
                name,
                self._namespace,
                body=k8s_client.V1DeleteOptions(grace_period_seconds=grace),
            )
            log.info("deleted pod %s/%s", self._namespace, name)
        except ApiException as e:
            if e.status != 404:
                raise

    def _delete_service(self, project_id: UUID, role: str) -> None:
        name = self._svc_name(project_id, role)
        try:
            self._v1.delete_namespaced_service(name, self._namespace)
            log.info("deleted service %s/%s", self._namespace, name)
        except ApiException as e:
            if e.status != 404:
                log.warning("delete service %s failed: %s", name, e)

    # ── async wait helpers ─────────────────────────────────────────────────────

    async def _wait_pod_gone(self, project_id: UUID, role: str) -> None:
        deadline = time.monotonic() + TERMINATE_TIMEOUT_S
        pod_name = self._pod_name(project_id, role)
        while time.monotonic() < deadline:
            pod = await asyncio.to_thread(self._find_pod, project_id, role)
            if pod is None:
                return
            await asyncio.sleep(1.0)
        raise TimeoutError(
            f"pod {pod_name} did not terminate within {TERMINATE_TIMEOUT_S}s"
        )

    async def _wait_ready(self, project_id: UUID, role: str) -> None:
        pod_name = self._pod_name(project_id, role)
        deadline = time.monotonic() + READY_TIMEOUT_S
        log.info(
            "waiting for pod %s/%s to become ready (timeout %.0fs)",
            self._namespace,
            pod_name,
            READY_TIMEOUT_S,
        )
        while time.monotonic() < deadline:
            pod = await asyncio.to_thread(self._find_pod, project_id, role)
            if pod and pod.status:
                phase = pod.status.phase or "Unknown"
                if phase in ("Failed", "Unknown"):
                    raise RuntimeError(f"pod {pod_name} entered terminal phase {phase}")
                conditions = pod.status.conditions or []
                for cond in conditions:
                    if cond.type == "Ready" and cond.status == "True":
                        return
            await asyncio.sleep(POLL_INTERVAL_S)

        # Fetch logs before raising to aid debugging.
        try:
            logs = await asyncio.to_thread(
                self._v1.read_namespaced_pod_log,
                pod_name,
                self._namespace,
                tail_lines=50,
            )
            log.error(
                "pod %s never became ready; last 50 lines:\n%s", pod_name, logs
            )
        except Exception:
            log.warning("could not retrieve logs for %s", pod_name, exc_info=True)

        raise TimeoutError(
            f"pod {pod_name} did not become ready within {READY_TIMEOUT_S}s"
        )

    # ── pod → AgentStatus ──────────────────────────────────────────────────────

    @staticmethod
    def _pod_state(pod) -> Literal["starting", "running", "unhealthy", "stopped"]:  # type: ignore[no-untyped-def]
        if pod is None:
            return "stopped"
        phase = (pod.status.phase or "Unknown") if pod.status else "Unknown"
        if phase == "Pending":
            return "starting"
        if phase == "Running":
            for cond in (pod.status.conditions or []):
                if cond.type == "Ready" and cond.status == "True":
                    return "running"
            return "starting"  # Running but readiness probe not yet passing
        if phase in ("Failed", "Unknown"):
            return "unhealthy"
        return "stopped"

    # ── lifecycle ──────────────────────────────────────────────────────────────

    async def ensure_running(
        self,
        project_id: UUID,
        *,
        secrets: AgentSecrets,
        role: str = "editor",
    ) -> AgentEndpoint:
        cached = self._endpoints.get((project_id, role))
        if cached is not None:
            return cached

        existing = await asyncio.to_thread(self._find_pod, project_id, role)
        if existing is not None:
            # Pod exists but we have no cached endpoint — likely a backend restart
            # that wiped the in-memory token. Delete and recreate to reissue.
            log.warning(
                "found pod %s with no cached endpoint; recreating to reissue token",
                self._pod_name(project_id, role),
            )
            await asyncio.to_thread(self._delete_pod, project_id, role, 5)
            await self._wait_pod_gone(project_id, role)

        token = self._tokens.get(project_id)
        if token is None:
            token = pysecrets.token_urlsafe(32)
            self._tokens[project_id] = token

        await asyncio.to_thread(
            self._ensure_pvc, self._wiki_pvc(project_id), WIKI_PVC_SIZE
        )
        await asyncio.to_thread(
            self._ensure_pvc, self._sessions_pvc(project_id, role), SESSIONS_PVC_SIZE
        )
        await asyncio.to_thread(self._ensure_service, project_id, role)

        pod_spec = self._build_pod_spec(project_id, role, token, secrets)
        pod_name = self._pod_name(project_id, role)
        log.info("creating pod %s/%s", self._namespace, pod_name)

        try:
            pod = await asyncio.to_thread(
                self._v1.create_namespaced_pod, self._namespace, pod_spec
            )
        except ApiException:
            log.exception("failed to create pod %s", pod_name)
            raise

        url = self._agent_url(project_id, role)
        endpoint = AgentEndpoint(
            project_id=project_id,
            url=url,
            container_id=pod.metadata.name,
            bearer_token=token,
            started_at=datetime.now(timezone.utc),
        )

        try:
            await self._wait_ready(project_id, role)
        except (TimeoutError, RuntimeError):
            await asyncio.to_thread(self._delete_pod, project_id, role)
            raise

        self._endpoints[(project_id, role)] = endpoint
        return endpoint

    async def status(self, project_id: UUID, role: str = "editor") -> AgentStatus:
        pod = await asyncio.to_thread(self._find_pod, project_id, role)
        return AgentStatus(
            project_id=project_id,
            role=role,
            state=self._pod_state(pod),  # type: ignore[arg-type]
            container_id=pod.metadata.name if pod else None,
            extra={"phase": (pod.status.phase if pod and pod.status else "unknown") or "unknown"},
        )

    async def stop(
        self, project_id: UUID, *, grace_seconds: int = 30, role: str = "editor"
    ) -> None:
        log.info("stopping agent pod %s/%s", project_id, role)
        await asyncio.to_thread(self._delete_pod, project_id, role, grace_seconds)
        await asyncio.to_thread(self._delete_service, project_id, role)
        self._endpoints.pop((project_id, role), None)
        # Clear project token only when all role pods for this project are gone.
        if not any(k[0] == project_id for k in self._endpoints):
            self._tokens.pop(project_id, None)

    async def list_running(self) -> list[AgentStatus]:
        pods = await asyncio.to_thread(
            self._v1.list_namespaced_pod,
            self._namespace,
            label_selector="ttt.role=agent",
        )
        out: list[AgentStatus] = []
        for pod in pods.items:
            labels = pod.metadata.labels or {}
            raw_pid = labels.get("ttt.project_id")
            if not raw_pid:
                continue
            try:
                pid = UUID(raw_pid)
            except ValueError:
                continue
            agent_role = labels.get("ttt.agent_role", "editor")
            out.append(
                AgentStatus(
                    project_id=pid,
                    role=agent_role,
                    state=self._pod_state(pod),  # type: ignore[arg-type]
                    container_id=pod.metadata.name,
                    extra={"phase": (pod.status.phase if pod.status else "unknown") or "unknown"},
                )
            )
        return out

    async def health(self, project_id: UUID, role: str = "editor") -> bool:
        endpoint = self._endpoints.get((project_id, role))
        if endpoint is None:
            return False
        async with httpx.AsyncClient(timeout=5.0) as http:
            try:
                resp = await http.get(f"{endpoint.url}/healthz")
                return resp.status_code == 200
            except httpx.HTTPError:
                return False

    async def stream_logs(
        self, project_id: UUID, *, follow: bool = True, role: str = "editor"
    ) -> AsyncIterator[str]:
        pod = await asyncio.to_thread(self._find_pod, project_id, role)
        if pod is None:
            return
        logs = await asyncio.to_thread(
            self._v1.read_namespaced_pod_log,
            self._pod_name(project_id, role),
            self._namespace,
            tail_lines=200,
            follow=False,
        )
        for line in (logs or "").splitlines():
            yield line

    def get_bearer_token(self, project_id: UUID) -> str | None:
        return self._tokens.get(project_id)
