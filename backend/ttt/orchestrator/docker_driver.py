"""Local-dev `AgentOrchestrator` impl backed by the Docker daemon.

Spins up `ttt-agent-{project_id}` containers from the `ttt-agent:local`
image, names them deterministically so DNS-by-name routing works on the
shared `ttt-net` network, and tracks per-agent bearer tokens in memory.

Idempotent: calling `ensure_running` for a project whose container
already exists just returns the existing endpoint. Restarting the
backend rediscovers running agents but **does not** re-issue tokens —
those live in memory only, so a backend restart invalidates auth and
forces a clean `stop()`+`ensure_running()` cycle. That's intentional
during the prototype; a real deployment would persist tokens or sign
them with a backend-known secret.

Uses the docker SDK synchronously inside `asyncio.to_thread` since the
SDK is sync. Each call is short, so this is fine.
"""

from __future__ import annotations

import asyncio
import logging
import secrets as pysecrets
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import docker
import httpx
from docker.errors import APIError, NotFound
from docker.models.containers import Container

from ttt.config import settings
from ttt.orchestrator.base import (
    AgentEndpoint,
    AgentOrchestrator,
    AgentSecrets,
    AgentStatus,
)

log = logging.getLogger("ttt.orchestrator.docker")

AGENT_IMAGE = "ttt-agent:local"
AGENT_PORT = 8766
NETWORK_NAME = "ttt-net"
READY_TIMEOUT_S = 30.0
READY_POLL_INTERVAL_S = 0.5


class DockerOrchestrator(AgentOrchestrator):
    """Drives the Docker daemon to manage per-project agent containers."""

    def __init__(
        self,
        *,
        wiki_dir: Path | None = None,
        sessions_dir: Path | None = None,
        backend_url: str = "http://backend:8765",
        image: str = AGENT_IMAGE,
        network: str = NETWORK_NAME,
        publish_to_host: bool = False,
    ) -> None:
        self._client = docker.from_env()
        self._wiki_dir = (wiki_dir or settings.ttt_wiki_dir).resolve()
        self._sessions_dir = (sessions_dir or settings.ttt_sessions_dir).resolve()
        self._backend_url = backend_url
        self._image = image
        self._network = network
        # Local dev: backend on the host can't reach docker-network DNS
        # names, so publish each agent's port to a random host port and
        # talk to it via localhost. Production (backend in same network):
        # leave False, route by container name.
        self._publish_to_host = publish_to_host

        # Per-project bearer tokens — one token shared across both role
        # containers for the same project. Internal auth validates against this.
        self._tokens: dict[UUID, str] = {}

        # In-process cache of last `ensure_running` results, keyed by
        # (project_id, role) so viewer and editor endpoints are tracked independently.
        self._endpoints: dict[tuple[UUID, str], AgentEndpoint] = {}

        # When the backend runs as a Docker container, bind-mount sources
        # for agent containers must be host paths (the daemon runs on the
        # host). Translate our container-internal data dirs to their host
        # equivalents once at startup by inspecting our own container mounts.
        self._host_wiki_dir = self._to_host_path(self._wiki_dir)
        self._host_sessions_dir = self._to_host_path(self._sessions_dir)
        if self._host_wiki_dir != self._wiki_dir:
            log.info(
                "host path translation active: %s -> %s",
                self._wiki_dir,
                self._host_wiki_dir,
            )

        self._ensure_network()

    # ------------------------------------------------------------------ helpers

    def _container_name(self, project_id: UUID, role: str = "editor") -> str:
        return f"ttt-agent-{project_id}-{role}"

    def _ensure_network(self) -> None:
        try:
            self._client.networks.get(self._network)
        except NotFound:
            self._client.networks.create(self._network, driver="bridge")
            log.info("created docker network %s", self._network)

    def _find_container(self, project_id: UUID, role: str = "editor") -> Container | None:
        try:
            return self._client.containers.get(self._container_name(project_id, role))
        except NotFound:
            return None

    async def _wait_ready(self, url: str) -> None:
        deadline = asyncio.get_event_loop().time() + READY_TIMEOUT_S
        last_log_at = asyncio.get_event_loop().time()
        last_err: str = ""
        log.info("polling %s/readyz (timeout %ss)", url, READY_TIMEOUT_S)
        async with httpx.AsyncClient(timeout=2.0) as client:
            while asyncio.get_event_loop().time() < deadline:
                try:
                    resp = await client.get(f"{url}/readyz")
                    if resp.status_code == 200:
                        return
                    err = f"HTTP {resp.status_code}"
                except httpx.HTTPError as exc:
                    err = str(exc)
                now = asyncio.get_event_loop().time()
                if err != last_err or now - last_log_at >= 10:
                    log.debug("readyz probe failed: %s", err)
                    last_err = err
                    last_log_at = now
                await asyncio.sleep(READY_POLL_INTERVAL_S)
        raise TimeoutError(f"agent at {url} did not become ready within {READY_TIMEOUT_S}s")

    # ------------------------------------------------------------------ lifecycle

    async def ensure_running(
        self,
        project_id: UUID,
        *,
        secrets: AgentSecrets,
        role: str = "editor",
    ) -> AgentEndpoint:
        existing = await asyncio.to_thread(self._find_container, project_id, role)
        if existing is not None and existing.status == "running":
            cached = self._endpoints.get((project_id, role))
            if cached is not None:
                return cached
            # Container is running but we don't have an endpoint cached — likely
            # a backend restart. Stop and recreate so we control the token.
            log.warning(
                "found running %s with no cached endpoint; recreating",
                self._container_name(project_id, role),
            )
            await asyncio.to_thread(existing.stop, timeout=5)
            await asyncio.to_thread(existing.remove, force=True)

        # One token per project, shared across viewer and editor containers.
        token = self._tokens.get(project_id)
        if token is None:
            token = secrets_token()
            self._tokens[project_id] = token

        wiki_mount = self._wiki_dir / str(project_id)
        wiki_mount.mkdir(mode=0o777, parents=True, exist_ok=True)
        log.info("ensured wiki store for project %s role %s at %s with permissions: %o", project_id, role, wiki_mount, wiki_mount.stat().st_mode)

        # Per-role Claude transcript store — separate dirs so viewer and editor
        # sessions don't share a transcript namespace.
        session_mount = self._sessions_dir / str(project_id) / role
        session_mount.mkdir(parents=True, exist_ok=True)
        for _p in (self._sessions_dir, session_mount.parent, session_mount):
            if _p.exists():
                try:
                    _p.chmod(0o777)
                except OSError as exc:
                    log.warning("chmod 0o777 %s failed: %s", _p, exc)
        log.info("ensured session store for project %s role %s at %s with permissions: %o", project_id, role, session_mount, session_mount.stat().st_mode)

        # Use host-translated paths as bind-mount sources: mkdir above creates
        # the dirs on the backend's own filesystem (container-internal); Docker
        # needs the corresponding host path when we're running containerised.
        host_wiki_mount = self._host_wiki_dir / str(project_id)
        host_session_mount = self._host_sessions_dir / str(project_id) / role

        env = {
            "TTT_PROJECT_ID": str(project_id),
            "TTT_BACKEND_URL": self._backend_url,
            "TTT_AGENT_TOKEN": token,
            "TTT_AGENT_ROLE": role,
            "TTT_CHAT_MODEL": settings.chat_model,
            "TTT_INGEST_MODEL": settings.ingest_model,
            "LOG_LEVEL": settings.log_level,
            **secrets.as_env(),
        }

        name = self._container_name(project_id, role)
        log.info("starting agent container %s on %s", name, self._network)

        ports = {f"{AGENT_PORT}/tcp": None} if self._publish_to_host else None

        def _run() -> Container:
            return self._client.containers.run(
                self._image,
                name=name,
                detach=True,
                network=self._network,
                environment=env,
                volumes={
                    str(host_wiki_mount): {"bind": "/project", "mode": "rw" if role == "editor" else "ro"},
                    str(host_session_mount): {"bind": "/home/agent", "mode": "rw"},
                },
                labels={
                    "ttt.project_id": str(project_id),
                    "ttt.agent_role": role,
                    "ttt.role": "agent",
                },
                restart_policy={"Name": "unless-stopped"},
                ports=ports,
            )

        try:
            container = await asyncio.to_thread(_run)
        except APIError:
            log.exception("docker run failed for %s", name)
            raise

        log.info("container %s started (id=%s)", name, container.id[:12])

        if self._publish_to_host:
            # Port mapping is only available after the daemon has bound the
            # container's port. `reload()` refreshes the attrs dict.
            await asyncio.to_thread(container.reload)
            host_port = self._resolve_host_port(container)
            url = f"http://localhost:{host_port}"
        else:
            url = f"http://{name}:{AGENT_PORT}"
        endpoint = AgentEndpoint(
            project_id=project_id,
            url=url,
            container_id=container.id,
            bearer_token=token,
            started_at=datetime.now(timezone.utc),
        )

        try:
            await self._wait_ready(url)
        except TimeoutError:
            def _diagnostics() -> tuple[str, str]:
                container.reload()
                status = container.status
                raw = container.logs(tail=50, timestamps=True)
                lines = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
                return status, lines

            try:
                c_status, c_logs = await asyncio.to_thread(_diagnostics)
                log.error(
                    "agent %s never became ready (container status=%s); last 50 log lines:\n%s",
                    name, c_status, c_logs,
                )
            except Exception:
                log.warning("could not fetch container diagnostics", exc_info=True)

            await asyncio.to_thread(container.stop, timeout=5)
            await asyncio.to_thread(container.remove, force=True)
            raise

        self._endpoints[(project_id, role)] = endpoint
        return endpoint

    async def status(self, project_id: UUID, role: str = "editor") -> AgentStatus:
        container = await asyncio.to_thread(self._find_container, project_id, role)
        if container is None:
            return AgentStatus(project_id=project_id, role=role, state="stopped")

        state_map = {
            "running": "running",
            "created": "starting",
            "restarting": "starting",
            "exited": "stopped",
            "paused": "unhealthy",
            "dead": "unhealthy",
        }
        return AgentStatus(
            project_id=project_id,
            role=role,
            state=state_map.get(container.status, "unhealthy"),  # type: ignore
            container_id=container.id,
            extra={"docker_status": container.status},
        )

    async def stop(
        self, project_id: UUID, *, grace_seconds: int = 30, role: str = "editor"
    ) -> None:
        container = await asyncio.to_thread(self._find_container, project_id, role)
        if container is None:
            return
        log.info("stopping agent container %s/%s", project_id, role)
        try:
            await asyncio.to_thread(container.stop, timeout=grace_seconds)
        except APIError:
            log.exception("docker stop failed for %s/%s", project_id, role)
        try:
            await asyncio.to_thread(container.remove, force=True)
        except APIError:
            log.exception("docker remove failed for %s/%s", project_id, role)
        self._endpoints.pop((project_id, role), None)
        # Only clear the project token when both containers are gone.
        editor_gone = self._endpoints.get((project_id, "editor")) is None
        viewer_gone = self._endpoints.get((project_id, "viewer")) is None
        if editor_gone and viewer_gone:
            self._tokens.pop(project_id, None)

    async def list_running(self) -> list[AgentStatus]:
        def _list() -> list[Container]:
            return self._client.containers.list(
                all=True, filters={"label": "ttt.role=agent"}
            )

        containers = await asyncio.to_thread(_list)
        out: list[AgentStatus] = []
        for c in containers:
            label = c.labels.get("ttt.project_id")
            if not label:
                continue
            try:
                pid = UUID(label)
            except ValueError:
                continue
            agent_role = c.labels.get("ttt.agent_role", "editor")
            out.append(await self.status(pid, agent_role))
        return out

    async def health(self, project_id: UUID, role: str = "editor") -> bool:
        endpoint = self._endpoints.get((project_id, role))
        if endpoint is None:
            return False
        async with httpx.AsyncClient(timeout=2.0) as client:
            try:
                resp = await client.get(f"{endpoint.url}/healthz")
                return resp.status_code == 200
            except httpx.HTTPError:
                return False

    async def stream_logs(
        self, project_id: UUID, *, follow: bool = True, role: str = "editor"
    ) -> AsyncIterator[str]:
        container = await asyncio.to_thread(self._find_container, project_id, role)
        if container is None:
            return

        def _stream():
            return container.logs(stream=True, follow=follow, tail=200)

        gen = await asyncio.to_thread(_stream)
        for chunk in gen:
            yield chunk.decode("utf-8", errors="replace")

    def get_bearer_token(self, project_id: UUID) -> str | None:
        return self._tokens.get(project_id)

    @staticmethod
    def _own_container_id() -> str | None:
        """Return this container's ID, or None if not running in Docker."""
        if not Path("/.dockerenv").exists():
            return None
        # cgroup v1: last path component is the 64-char container ID
        try:
            with open("/proc/self/cgroup") as f:
                for line in f:
                    candidate = line.strip().split("/")[-1]
                    if len(candidate) == 64 and all(c in "0123456789abcdef" for c in candidate):
                        return candidate
        except OSError:
            pass
        # cgroup v2 / Docker Desktop: /etc/hostname holds the short container ID
        try:
            return Path("/etc/hostname").read_text().strip()
        except OSError:
            return None

    def _to_host_path(self, container_path: Path) -> Path:
        """Translate a container-internal path to the host path the Docker
        daemon needs as a bind-mount source. Returns the path unchanged when
        running directly on the host or when translation cannot be determined."""
        own_id = self._own_container_id()
        if own_id is None:
            return container_path
        try:
            own = self._client.containers.get(own_id)
            for mount in own.attrs.get("Mounts", []) or []:
                dest = mount.get("Destination", "")
                source = mount.get("Source", "")
                if not dest or not source:
                    continue
                try:
                    rel = container_path.relative_to(Path(dest))
                    return Path(source) / rel
                except ValueError:
                    continue
        except Exception:
            log.warning(
                "could not resolve host path for %s; using container path",
                container_path,
            )
        return container_path

    @staticmethod
    def _resolve_host_port(container: Container) -> int:
        """Pull the published host port for the agent's exposed port out
        of the container's NetworkSettings. Docker assigns one when we
        pass `ports={f'{AGENT_PORT}/tcp': None}`."""
        bindings = (
            (container.attrs.get("NetworkSettings", {}) or {}).get("Ports", {}) or {}  # type: ignore
        )
        entry = bindings.get(f"{AGENT_PORT}/tcp") or []
        for b in entry:
            host_port = b.get("HostPort")
            if host_port:
                return int(host_port)
        raise RuntimeError(
            f"docker did not publish a host port for {AGENT_PORT}/tcp on "
            f"{container.name}; bindings={bindings!r}"
        )


def secrets_token() -> str:
    """32 bytes of urlsafe base64 — ~256 bits. Plenty for a per-agent
    bearer that lives in memory only."""
    return pysecrets.token_urlsafe(32)
