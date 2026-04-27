# syntax=docker/dockerfile:1.7

# ─── deps ────────────────────────────────────────────────────────────────────
# pnpm install happens on Node because pnpm's native bindings assume Node.
# We only need Bun at runtime.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

# Manifest files first for cache stability.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod=false

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS runner
WORKDIR /app

# wget for healthcheck + postgres client for the db-migrate service
# (same image is reused in docker-compose with a different entrypoint).
RUN apk add --no-cache wget postgresql17-client

# Copy installed node_modules (symlinked via pnpm) and source.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY package.json pnpm-workspace.yaml ./
# Needed by the db-migrate service (drizzle-kit push reads from here)
COPY drizzle.config.ts ./
COPY scripts ./scripts
RUN chmod +x scripts/*.sh || true

# Writable dir for MaxMind DB (mount a volume here in compose)
RUN mkdir -p /var/data && chown -R bun:bun /var/data

USER bun

EXPOSE 3001
ENV PORT=3001

WORKDIR /app/apps/api
# Entrypoint script runs `drizzle-kit push --force` to apply schema diffs
# (idempotent: no-op when there's nothing new) and sets up TimescaleDB
# hypertables on first boot, then execs the API server. Without this,
# adding a column to packages/db/src/schema.ts wouldn't reach the live DB.
CMD ["sh", "/app/scripts/api-entrypoint.sh"]
