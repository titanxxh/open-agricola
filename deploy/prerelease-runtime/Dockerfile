# syntax=docker/dockerfile:1
FROM rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c AS trial-objects
FROM node:24.19.0-bookworm-slim AS node
FROM postgres:18-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650
COPY --from=node /usr/local/ /usr/local/
COPY --from=trial-objects /usr/bin/rustfs /usr/local/lib/oa/trial-rustfs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git libnss-wrapper python3 python3-yaml make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10.33.0 \
    && npm cache clean --force \
    && groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
LABEL io.open-agricola.prerelease-runtime="1"
COPY fetch-dependencies.py prepare.sh trial.sh /usr/local/lib/oa/
ENV PG_CLIENT_MODE=local FRONTEND_ROOT=/app/frontend-dist NODE_ENV=production
WORKDIR /app
USER node
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD node -e "fetch('http://127.0.0.1:5175/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT []
CMD ["node", "--import", "./scripts/typescript-runtime.mjs", "scripts/container-entry.ts"]
