# assisted-by Codex Codex-sonnet-4-6

FROM artifactory.devhub-cloud.cisco.com/sto-ccc-docker-local/hardened_ubuntu:22.04 AS base

# Install Node.js via nvm (matching outshift.cisco.com pattern)
ENV NODE_VERSION=20.19.0
ENV NVM_DIR=/usr/local/nvm
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get -y install curl git && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p "$NVM_DIR" && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION} && nvm use v${NODE_VERSION} && \
    nvm alias default v${NODE_VERSION}

ENV PATH="/usr/local/nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

RUN node --version && npm --version

# Build stage
FROM base AS build
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci

COPY frontend ./

ENV CAIPE_PROXY=1
ENV BASE_PATH=/apps/ttt
RUN npm run build

# Runtime stage
FROM base
WORKDIR /app

COPY --from=build /build/.next/ /app/.next/
COPY --from=build /build/node_modules/ /app/node_modules/
COPY --from=build /build/package.json /app/
# `next start` loads runtime config from next.config.js; without it, the CAIPE
# basePath env is ignored and `/apps/ttt` serves Next's 404 page.
COPY --from=build /build/next.config.js /app/next.config.js

ENV CAIPE_PROXY=1
ENV BASE_PATH=/apps/ttt
ENV TTT_API_URL=

EXPOSE 3000

USER 1001

# NOTE: Uses production build. Swap CMD to `["npx", "next", "dev", ...]` for local PoC iteration.
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
