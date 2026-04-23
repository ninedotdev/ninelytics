# syntax=docker/dockerfile:1.7

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod=false

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

# Full workspace for typed imports from @ninelytics/{api,shared,db}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY apps/web ./apps/web
COPY apps/api ./apps/api
COPY packages ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

WORKDIR /app/apps/web
RUN pnpm build
# Sanity check: fail loudly if the build silently produces nothing.
RUN ls dist/server/server.js > /dev/null

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS runner
WORKDIR /app

RUN apk add --no-cache wget

# Ship node_modules — tanstack-start's vite build externalizes most deps
# so dist/server/server.js imports them at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/dist /app/apps/web/dist
COPY --from=builder /app/apps/web/package.json /app/apps/web/package.json
COPY --from=builder /app/apps/web/server-prod.js /app/apps/web/server-prod.js
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./

USER bun

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

WORKDIR /app/apps/web
CMD ["bun", "run", "server-prod.js"]
