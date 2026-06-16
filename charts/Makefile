.PHONY: default help helm-deps helm-lint helm-render helm-ci

default: help

help:
	@echo "Makefile for Tiny Teams with Tokens"
	@echo
	@echo "Usage:"
	@echo "  make [target]"
	@echo
	@echo "Targets:"
	@echo "  helm-deps             Fetch Helm chart dependencies (postgres-operator subchart)"
	@echo "  helm-lint             Lint the llm-wiki Helm chart"
	@echo "  helm-render           Render the chart to /tmp/llm-wiki-rendered.yaml for inspection"
	@echo "  helm-ci               Run all Helm checks (deps + lint + render)"

# ── Helm ──────────────────────────────────────────────────────────────────────

HELM_CHART   := llm-wiki
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