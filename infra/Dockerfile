# ── Stage 1: Build ──
FROM node:22-alpine AS builder

WORKDIR /build

# Install dependencies (layer cached unless lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci --omit=optional

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Type-check and compile
RUN npx tsc --noEmit && npx tsc --outDir dist

# Prune dev dependencies for smaller runtime size
RUN npm prune --omit=dev

# ── Stage 2: Runtime with nginx reverse proxy ──
FROM node:22-alpine

RUN apk add --no-cache nginx

# Create the oncoflow user/group
RUN addgroup -S oncoflow && adduser -S -G oncoflow oncoflow

# ── nginx ──
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /var/cache/nginx /var/log/nginx && \
    chown -R oncoflow:oncoflow /var/cache/nginx /var/log/nginx /etc/nginx

# ── Application ──
WORKDIR /app

# Copy only what's needed for production from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY package.json ./

# ── Health check ──
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080

USER oncoflow

# ── Start: nginx reverse proxy + Node app ──
# nginx runs on port 8080, proxies to Node on 3000
CMD nginx && node dist/index.js
