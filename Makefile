.PHONY: backend-install lint typecheck test backend-ci \
        frontend-install frontend-typecheck frontend-build frontend-ci ci \
        db-migrate db-revision db-history db-current \
        helm-deps helm-lint helm-render helm-ci \
        build-images clean-build-stamps

default: help

help:
	@echo "Makefile for Tiny Teams with Tokens"
	@echo
	@echo "Usage:"
	@echo "  make [target]"
	@echo
	@echo "Targets:"
	@echo "  backend-install       Install backend dependencies"
	@echo "  lint                  Run linter on backend code"
	@echo "  typecheck             Run type checker on backend code"
	@echo "  test                  Run tests on backend code"
	@echo "  backend-ci            Run all backend CI checks (lint, typecheck, test)"
	@echo
	@echo "  frontend-install      Install frontend dependencies"
	@echo "  frontend-typecheck    Run type checker on frontend code"
	@echo "  frontend-build        Build the frontend"
	@echo "  frontend-ci           Run all frontend CI checks (typecheck, build)"
	@echo
	@echo "  ci                    Run all CI checks (backend and frontend)"
	@echo
	@echo "  db-migrate            Run database migrations"
	@echo "  db-revision           Create a new database migration revision"
	@echo "  db-history            Show database migration history"
	@echo "  db-current            Show current database migration version"
	@echo
	@echo "  helm-deps             Fetch Helm chart dependencies (postgres-operator subchart)"
	@echo "  helm-lint             Lint the llm-wiki Helm chart"
	@echo "  helm-render           Render the chart to /tmp/llm-wiki-rendered.yaml for inspection"
	@echo "  helm-ci               Run all Helm checks (deps + lint + render)"
	@echo
	@echo "  build-images          Build Docker images (skips unchanged images)"
	@echo "  clean-build-stamps    Remove build stamps to force a full rebuild on next build-images"

up:
	bash ./up.sh

# ── Backend ───────────────────────────────────────────────────────────────────

backend-install:
	uv sync --group dev

lint:
	uv run ruff check .

typecheck:
	uv run ty check backend/ttt

test:
	uv run pytest -x -q

backend-ci: lint typecheck test

# ── Database migrations (Alembic) ─────────────────────────────────────────────

db-migrate:
	cd backend && uv run alembic upgrade head

db-revision:
	cd backend && uv run alembic revision --autogenerate -m "$(MSG)"

db-history:
	cd backend && uv run alembic history

db-current:
	cd backend && uv run alembic current

# ── Frontend ──────────────────────────────────────────────────────────────────

frontend-install:
	cd frontend && npm ci

frontend-typecheck:
	cd frontend && npx tsc --noEmit

frontend-build:
	cd frontend && NEXT_TELEMETRY_DISABLED=1 npm run build

frontend-ci: frontend-typecheck frontend-build

# ── All ───────────────────────────────────────────────────────────────────────

ci: backend-ci frontend-ci

# ── Helm ──────────────────────────────────────────────────────────────────────

HELM_CHART   := charts/llm-wiki
HELM_RELEASE := llm-wiki

helm-deps:
	helm dependency update $(HELM_CHART)

helm-lint: helm-deps
	helm lint $(HELM_CHART) --set secrets.POSTGRES_PASSWORD=dummy

helm-render: helm-deps
	helm template $(HELM_RELEASE) $(HELM_CHART) \
	  --set secrets.POSTGRES_PASSWORD=dummy \
	  --set secrets.ANTHROPIC_API_KEY=dummy \
	  > /tmp/$(HELM_RELEASE)-rendered.yaml
	@echo "Rendered to /tmp/$(HELM_RELEASE)-rendered.yaml"

helm-ci: helm-lint helm-render

# ── Docker image builds ────────────────────────────────────────────────────────
# Stamp files under .build/ track the last successful build of each image.
# Make compares source mtimes to the stamp and only rebuilds when something changed.
# Run `make clean-build-stamps` to force a full rebuild on next `make build-images`.

IMAGE_REGISTRY := ghcr.io/cisco-eti
BACKEND_IMAGE  := $(IMAGE_REGISTRY)/tiny-teams-with-tokens-backend:latest
AGENT_IMAGE    := $(IMAGE_REGISTRY)/tiny-teams-with-tokens-agent:latest
FRONTEND_IMAGE := $(IMAGE_REGISTRY)/tiny-teams-with-tokens-frontend:latest

_BACKEND_SRCS := \
  pyproject.toml uv.lock backend/alembic.ini backend/Dockerfile \
  $(shell find backend/ttt backend/alembic -type f \
    -not -path '*/__pycache__/*' -not -name '*.pyc')

_AGENT_SRCS := \
  pyproject.toml uv.lock backend/Dockerfile.agent \
  backend/ttt/__init__.py backend/ttt/config.py \
  backend/ttt/orchestrator/__init__.py \
  backend/ttt/orchestrator/contract.py \
  backend/ttt/orchestrator/base.py \
  backend/ttt/reports/__init__.py backend/ttt/reports/schema.py \
  deploy/certs/cisco_secure_access_root_ca.pem \
  $(shell find backend/ttt/agent backend/ttt/prompts -type f \
    -not -path '*/__pycache__/*' -not -name '*.pyc')

_FRONTEND_SRCS := \
  frontend/Dockerfile \
  $(shell find frontend -type f \
    -not -path '*/node_modules/*' \
    -not -path '*/.next/*' \
    -not -path '*/out/*' \
    -not -name '*.log')

.build/backend: Makefile $(_BACKEND_SRCS)
	docker build -t $(BACKEND_IMAGE) -f backend/Dockerfile .
	@mkdir -p $(@D) && touch $@

.build/agent: Makefile $(_AGENT_SRCS)
	docker build -t $(AGENT_IMAGE) --target development -f backend/Dockerfile.agent .
	@mkdir -p $(@D) && touch $@

.build/frontend: Makefile $(_FRONTEND_SRCS)
	docker build -t $(FRONTEND_IMAGE) -f frontend/Dockerfile .
	@mkdir -p $(@D) && touch $@

build-images: .build/backend .build/agent .build/frontend

clean-build-stamps:
	rm -rf .build
