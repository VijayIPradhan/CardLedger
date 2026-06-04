# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/app/package.json ./packages/app/package.json

ENV HUSKY=0
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/app ./packages/app

# Build shared so the app can import from it
RUN cd packages/shared && pnpm build

# VITE_API_URL="" → axios uses relative URLs → nginx proxies to server
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN cd packages/app && pnpm build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

COPY packages/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
