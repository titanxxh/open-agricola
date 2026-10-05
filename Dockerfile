# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
    && pnpm install --frozen-lockfile
COPY . .
RUN REPLAY_VIEWER_ROOT=/app/viewer-builds pnpm run build:replay-viewer \
    && pnpm prune --prod

# Native PostgreSQL 18 clients match the local database major version.
FROM postgres:18-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650 AS production
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/viewer-builds ./viewer-builds
COPY --chown=node:node package.json tsconfig*.json ./
COPY --chown=node:node shared/ ./shared/
COPY --chown=node:node server/ ./server/
COPY --chown=node:node scripts/ ./scripts/
RUN mkdir -p data output && chown node:node data output
ARG GAME_BUILD_ID=development
ENV GAME_BUILD_ID=$GAME_BUILD_ID
ENV NODE_ENV=production BACKEND_PORT=5175 BACKEND_HOST=0.0.0.0 APP_INSTANCES=1 PG_CLIENT_MODE=local
EXPOSE 5175
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
    CMD node -e "fetch('http://127.0.0.1:5175/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
ENTRYPOINT []
CMD ["node", "--import", "tsx", "scripts/container-entry.ts"]
