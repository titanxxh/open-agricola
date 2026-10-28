FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && NODE_USE_ENV_PROXY=1 corepack prepare pnpm@10.33.0 --activate \
    && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY accounts-exporter.ts provision.ts ./
ARG OPERATIONS_BUILD_ID=development
ENV OPERATIONS_BUILD_ID=$OPERATIONS_BUILD_ID NODE_ENV=production
USER node
HEALTHCHECK --interval=10s --timeout=4s --start-period=5s --retries=6 \
    CMD node -e "fetch('http://127.0.0.1:'+ (process.env.ACCOUNTS_PORT || '9201') +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "accounts-exporter.ts"]
