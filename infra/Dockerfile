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

# tini is PID 1: reaps zombie processes and forwards signals correctly to both children
# (Node itself only handles this for its own subprocesses, not for nginx as a sibling).
RUN apk add --no-cache nginx tini

# Create the oncoflow user/group
RUN addgroup -S oncoflow && adduser -S -G oncoflow oncoflow

# ── nginx ──
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/lib/nginx/tmp /run/nginx && \
    chown -R oncoflow:oncoflow /var/cache/nginx /var/log/nginx /var/lib/nginx /run/nginx /etc/nginx

# ── Application ──
WORKDIR /app

# Copy only what's needed for production from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY package.json ./
COPY infra/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown oncoflow:oncoflow /app/entrypoint.sh

# ── Health check ──
# 127.0.0.1, not localhost: nginx only binds IPv4 (listen 8080, no [::]:8080), but "localhost"
# resolves to ::1 first inside this container — wget would hit connection-refused on every
# probe and the container would show permanently unhealthy despite serving real traffic fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

EXPOSE 8080

USER oncoflow

# nginx runs on port 8080, proxies to Node on 3000 (see infra/nginx/nginx.conf)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
