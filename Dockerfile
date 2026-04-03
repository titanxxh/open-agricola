# syntax=docker/dockerfile:1

# ── Stage 1: production dependencies (native deps for better-sqlite3/canvas) ──
FROM node:22-alpine AS deps

RUN apk add --no-cache \
    python3 make g++ \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev

WORKDIR /app
COPY package.json package-lock.json ./
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ── Stage 2: production ──────────────────────────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache \
    cairo pango jpeg giflib librsvg pixman

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules

# Copy server + shared source (tsx runs TS directly)
COPY shared/ ./shared/
COPY server/ ./server/
COPY tsconfig*.json ./

# Data directories
RUN mkdir -p data output

ENV NODE_ENV=production
ENV BACKEND_PORT=5175
ENV PERSIST_ROOMS=sqlite
ENV DB_PATH=./data/open-agricola.db
ENV CARD_ART_DIR=./data/card-art

EXPOSE 5175

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5175/api/health || exit 1

CMD ["node", "--import", "tsx", "server/index.ts"]
