# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/server/package.json ./packages/server/package.json

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Build shared then server
RUN cd packages/shared && pnpm build
RUN cd packages/server && pnpm build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/server/package.json ./packages/server/package.json

# Production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Migrations SQL files must be present at runtime
COPY packages/server/drizzle ./packages/server/drizzle

WORKDIR /app/packages/server
EXPOSE 3001

CMD ["node", "dist/index.js"]
