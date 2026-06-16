# local-kind — llm-wiki on a local Kubernetes cluster

Runs the `charts/llm-wiki` Helm chart on a local [kind](https://kind.sigs.k8s.io/) (Kubernetes in Docker) cluster. The cluster maps host port **3000 → nginx ingress port 80**, so the app URL and OAuth redirect URIs are identical to the Docker Compose setup — no OAuth app re-registration required when switching between environments.

## Prerequisites

- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [helm](https://helm.sh/docs/intro/install/) ≥ 3.14
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Docker running
- `.env` at the repo root with at minimum `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` (same file used by Docker Compose)

## Quick start

All `make` targets are run from the **repo root**:

```bash
# Full setup: cluster + nginx ingress + postgres operator + Helm chart
make -f deploy/local-kind/Makefile up

# App is now available at:
open http://localhost:3000/apps/ttt
```

Teardown:

```bash
make -f deploy/local-kind/Makefile down   # deletes the cluster
```

## How it works

`make up` runs four steps in order:

| Step | Target | What it does |
|------|--------|--------------|
| 1 | `kind-create` | Creates a single-node kind cluster named `llm-wiki-local` using `kind-config.yaml` |
| 2 | `ingress-install` | Installs the kind-compatible nginx ingress controller and waits for it to be ready |
| 3 | `operator-install` | Adds the Zalando postgres-operator Helm repo and installs the operator |
| 4 | `helm-install` | Installs the `charts/llm-wiki` chart with `values-local.yaml` overrides |

The postgres-operator is installed cluster-wide (step 3) and then `values-local.yaml` sets `postgres-operator.enabled: false` so the chart doesn't try to manage the operator's lifecycle.

## Working with locally built images

By default `values-local.yaml` pulls images from a local registry at `localhost:5001`. Start the registry and create the cluster with registry support using the provided script:

```bash
# Create cluster with a local Docker registry at localhost:5001
CLUSTER_NAME=llm-wiki-local ./deploy/local-kind/kind-with-registry.sh
```

Then build and push your images:

```bash
# Build
docker build -t ghcr.io/cisco-eti/tiny-teams-with-tokens-backend:latest  -f backend/Dockerfile .
docker build -t ghcr.io/cisco-eti/tiny-teams-with-tokens-frontend:latest  -f frontend/Dockerfile .
docker build -t ghcr.io/cisco-eti/tiny-teams-with-tokens-agent:latest     -f backend/Dockerfile.agent .

# Push to local registry (re-tags to localhost:5001/... automatically)
make -f deploy/local-kind/Makefile docker-push
```

**Alternative — load images directly into kind** (no registry needed):

```bash
make -f deploy/local-kind/Makefile kind-load
```

This uses `kind load docker-image` which copies images from the local Docker daemon straight into the cluster nodes.

## Common workflows

```bash
# Check cluster state
make -f deploy/local-kind/Makefile status

# Reinstall chart after changing values-local.yaml or chart templates
make -f deploy/local-kind/Makefile reset

# Upgrade chart in place (non-destructive, preserves PVCs)
make -f deploy/local-kind/Makefile helm-upgrade

# Direct port-forwards (bypasses ingress — useful for debugging)
# Frontend on 3001 (3000 is taken by ingress), backend on 8765
make -f deploy/local-kind/Makefile port-forward
```

## Secrets

Secrets are read from `.env` at the repo root via `-include ../../.env`. The postgres password defaults to `ttt-local-dev` and can be overridden:

```bash
make -f deploy/local-kind/Makefile up KIND_POSTGRES_PASSWORD=mypassword
```

> **Note**: Once the postgres cluster is initialised, the password is immutable for the lifetime of the PVC. `make reset` (uninstall + reinstall) picks up a new password; `make down` + `make up` starts fresh.

## Port mapping rationale

`kind-config.yaml` maps `hostPort: 3000 → containerPort: 80` so the nginx ingress is reachable at `localhost:3000`. This matches the Docker Compose frontend port, which means OAuth redirect URIs (`http://localhost:3000/apps/ttt/oauth/...`) registered in GitHub, Confluence, and Webex don't need to change when switching between the two environments.

## Files

| File | Purpose |
|------|---------|
| `Makefile` | All cluster and chart lifecycle targets |
| `kind-config.yaml` | Kind cluster spec: single control-plane node with nginx ingress port mappings |
| `kind-with-registry.sh` | Helper script to create a kind cluster with a local Docker registry at `localhost:5001` |
| `values-local.yaml` | Helm values overrides: smaller resources, local registry, ingress on `localhost`, debug logging |
