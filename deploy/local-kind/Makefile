.PHONY: default help \
        kind-create kind-delete kind-load \
        ingress-install operator-install \
        helm-deps helm-install helm-upgrade helm-uninstall \
        up down reset status port-forward

CLUSTER_NAME := llm-wiki-local
CHART        := ../../charts/llm-wiki
RELEASE      := llm-wiki
VALUES       := ./values-local.yaml
NAMESPACE    := default
KUBECONTEXT  := kind-$(CLUSTER_NAME)
DOCKER_REGISTRY_NAME := local-registry
DOCKER_REGISTRY_PORT := 5001

# Postgres password for local kind. Not a production secret; safe to default.
# Override with: make KIND_POSTGRES_PASSWORD=mypassword <target>
KIND_POSTGRES_PASSWORD ?= ttt-local-dev

# Load secrets from .env at the repo root (same file used by docker-compose).
# -include silently skips if .env is absent.
-include ../../.env
export

# Shared --set flags for Helm secrets. Defined once; used by install and upgrade.
HELM_SET_SECRETS := \
  --set secrets.ANTHROPIC_API_KEY="$(ANTHROPIC_API_KEY)" \
  --set secrets.ANTHROPIC_AUTH_TOKEN="$(ANTHROPIC_AUTH_TOKEN)" \
  --set secrets.ANTHROPIC_BASE_URL="$(ANTHROPIC_BASE_URL)" \
  --set secrets.GITHUB_TOKEN="$(GITHUB_TOKEN)" \
  --set secrets.GITHUB_CLIENT_SECRET="$(GITHUB_CLIENT_SECRET)" \
  --set secrets.CONFLUENCE_TOKEN="$(CONFLUENCE_TOKEN)" \
  --set secrets.CONFLUENCE_CLIENT_SECRET="$(CONFLUENCE_CLIENT_SECRET)" \
  --set secrets.CONFLUENCE_USER="$(CONFLUENCE_USER)" \
  --set secrets.WEBEX_TOKEN="$(WEBEX_TOKEN)" \
  --set secrets.WEBEX_CLIENT_SECRET="$(WEBEX_CLIENT_SECRET)" \
  --set secrets.POSTGRES_PASSWORD="$(KIND_POSTGRES_PASSWORD)"

default: help

help:
	@echo "Makefile for llm-wiki local kind cluster"
	@echo
	@echo "Prerequisites: kind, helm, kubectl, Docker"
	@echo "Secrets are read from .env at the repo root."
	@echo "ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is required."
	@echo
	@echo "Usage: make -f deploy/local-kind/Makefile <target>"
	@echo
	@echo "Targets:"
	@echo "  up                    Full setup: create cluster, install ingress + operator + chart"
	@echo "  down                  Delete the kind cluster (fast full teardown)"
	@echo "  reset                 Reinstall the chart without recreating the cluster"
	@echo "  status                Show pods, services, PVCs, and postgresql objects"
	@echo
	@echo "  kind-create           Create the kind cluster"
	@echo "  kind-delete           Delete the kind cluster"
	@echo "  kind-load             Load locally-built Docker images into the kind cluster"
	@echo "  ingress-install       Install nginx ingress controller (kind-compatible manifest)"
	@echo "  operator-install      Add Helm repo and install the Zalando postgres-operator"
	@echo
	@echo "  helm-deps             Fetch chart subchart dependencies"
	@echo "  helm-install          Install the llm-wiki chart with local values"
	@echo "  helm-upgrade          Upgrade the llm-wiki chart (non-destructive)"
	@echo "  helm-uninstall        Uninstall chart and delete PVCs"
	@echo
	@echo "  port-forward          Direct port-forwards (frontend on 3001, backend on 8765)"

# ── Kind cluster ──────────────────────────────────────────────────────────────

kind-create:
	{ kind get clusters | grep -q "$(CLUSTER_NAME)" ; } \
	  || { ./kind-with-registry.sh ; \
	    kubectl cluster-info --context $(KUBECONTEXT) ; }
	@echo "Cluster context: $(KUBECONTEXT)"


kind-delete:
	kind delete cluster --name $(CLUSTER_NAME)

kind-load:
	kind load docker-image ghcr.io/cisco-eti/tiny-teams-with-tokens-backend:latest  --name $(CLUSTER_NAME)
	kind load docker-image ghcr.io/cisco-eti/tiny-teams-with-tokens-frontend:latest --name $(CLUSTER_NAME)
	kind load docker-image ghcr.io/cisco-eti/tiny-teams-with-tokens-agent:latest    --name $(CLUSTER_NAME)

# ── Prerequisites ─────────────────────────────────────────────────────────────

ingress-install:
	kubectl apply --context $(KUBECONTEXT) \
	  -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
	kubectl wait --context $(KUBECONTEXT) \
	  --namespace ingress-nginx \
	  --for=condition=ready pod \
	  --selector=app.kubernetes.io/component=controller \
	  --timeout=180s

operator-install:
	helm repo add postgres-operator-charts \
	  https://opensource.zalando.com/postgres-operator/charts/postgres-operator --force-update
	helm upgrade --install postgres-operator postgres-operator-charts/postgres-operator \
	  --kube-context $(KUBECONTEXT) \
	  --wait --timeout 180s

# ── Helm ──────────────────────────────────────────────────────────────────────

docker-build:
	$(MAKE) -C ../.. build-images

# Push the locally built images to the kind cluster's registry so they can be used in Helm charts.
# Only retag and push if the image isn't already in the registry to speed up subsequent runs.
docker-push: docker-build
	@for image_name in backend frontend agent; do \
	  if ! { docker image inspect "ghcr.io/cisco-eti/tiny-teams-with-tokens-$$image_name:latest" \
	    | jq -e '.[].RepoTags | contains(["localhost:${DOCKER_REGISTRY_PORT}"])' >/dev/null ; } ; then \
		docker tag ghcr.io/cisco-eti/tiny-teams-with-tokens-$$image_name:latest \
			localhost:${DOCKER_REGISTRY_PORT}/ghcr.io/cisco-eti/tiny-teams-with-tokens-$$image_name:latest && \
		docker push localhost:${DOCKER_REGISTRY_PORT}/ghcr.io/cisco-eti/tiny-teams-with-tokens-$$image_name:latest; \
	  else \
		echo "Image localhost:${DOCKER_REGISTRY_PORT}/ghcr.io/cisco-eti/tiny-teams-with-tokens-$$image_name:latest already in registry, skipping push." ; \
	  fi ; \
	done

helm-deps:
	helm dependency update $(CHART)

helm-install: helm-deps docker-push
	@test -n "$(ANTHROPIC_API_KEY)" || test -n "$(ANTHROPIC_AUTH_TOKEN)" || \
	  (echo "Error: set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in .env" && exit 1)
	helm install $(RELEASE) $(CHART) \
	  --kube-context $(KUBECONTEXT) \
	  --namespace $(NAMESPACE) \
	  -f $(VALUES) \
	  $(HELM_SET_SECRETS) \
	  --wait --timeout 300s
	@echo
	@echo "App available at: http://localhost:3000/apps/ttt"

helm-upgrade: helm-deps
	helm upgrade $(RELEASE) $(CHART) \
	  --kube-context $(KUBECONTEXT) \
	  --namespace $(NAMESPACE) \
	  -f $(VALUES) \
	  $(HELM_SET_SECRETS)

helm-uninstall:
	helm uninstall $(RELEASE) --kube-context $(KUBECONTEXT) --namespace $(NAMESPACE) || true
	kubectl delete pvc \
	  --context $(KUBECONTEXT) \
	  --namespace $(NAMESPACE) \
	  -l app.kubernetes.io/instance=$(RELEASE) || true

helm-restart: helm-uninstall
	sleep 15 ; $(MAKE) helm-install

# ── Composite ─────────────────────────────────────────────────────────────────

up: kind-create ingress-install operator-install helm-install
	@echo "llm-wiki is running at http://localhost:3000/apps/ttt"

down: kind-delete

reset: helm-uninstall helm-install

# ── Operations ────────────────────────────────────────────────────────────────

status:
	kubectl get pods,svc,pvc,postgresql \
	  --context $(KUBECONTEXT) \
	  --namespace $(NAMESPACE)

port-forward:
	@echo "Direct port-forwards (bypasses ingress — useful for debugging):"
	@echo "  Frontend: http://localhost:3001/apps/ttt  (3001 avoids conflict with ingress on 3000)"
	@echo "  Backend:  http://localhost:8765"
	@echo "Press Ctrl-C to stop."
	kubectl port-forward --context $(KUBECONTEXT) svc/$(RELEASE)-frontend 3001:3000 & \
	kubectl port-forward --context $(KUBECONTEXT) svc/$(RELEASE)-backend  8765:8765 & \
	wait
