.PHONY: default help docker-build docker-up docker-down docker-clean

default: help

help:
	@echo "Makefile for Tiny Teams with Tokens"
	@echo
	@echo "Usage:"
	@echo "  make [target]"
	@echo
	@echo "Targets:"
	@echo "  docker-build          Build Docker images for local development"
	@echo "  docker-up             Start the application using Docker Compose"
	@echo "  docker-down           Stop the application and remove containers"
	@echo "  docker-clean          Stop the application, remove containers and volumes"

# -- Dev
ENV_FILE := ../../.env
COMPOSE := docker compose --env-file $(ENV_FILE) -f docker-compose.yml -f docker-compose.postgres.yml

docker-build:
	$(MAKE) -C ../.. build-images

docker-up: docker-build
	@test -r $(ENV_FILE) || (echo "Error: .env file not found or not readable. Please create a .env file with the required environment variables." && exit 1)
	@echo "The app is available at: http://localhost:3000/apps/ttt"
	$(COMPOSE) up

docker-down:
	$(COMPOSE) down

docker-clean:
	$(COMPOSE) down --volumes --remove-orphans
	docker ps --filter "name=ttt-agent" --format '{{.ID}}' | xargs -n 1 docker rm -f
	$(MAKE) -C ../.. clean-build-stamps
