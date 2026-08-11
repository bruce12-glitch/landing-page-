# =============================================================================
# VendorChain Platform — Multi-stage minimal production image
#   deps  →  builder  →  runner
# Base: node:20-alpine. Runs as non-root user `nodejs` (UID 1001).
# Healthcheck probe against GET /api/health.
# =============================================================================

# ---- Stage 1: deps (install production + dev deps for build) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: builder (compile + type-check) ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure Prisma client is generated (mirrors schema) before build.
RUN npx prisma generate || true
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 3: runner (minimal runtime, non-root) ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create the non-root system user `nodejs` (UID 1001) with the `nextjs` group.
RUN addgroup -S nextjs && adduser -S nodejs -u 1001 -G nextjs \
    && mkdir -p /app/.next /app/.next/cache /app/storage \
    && chown -R nodejs:nextjs /app

# Copy the minimal production output only.
COPY --from=builder --chown=nodejs:nextjs /app/next.config.mjs ./
COPY --from=builder --chown=nodejs:nextjs /app/package.json ./
COPY --from=builder --chown=nodejs:nextjs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nextjs /app/.next ./.next
COPY --from=builder --chown=nodejs:nextjs /app/public ./public
COPY --from=builder --chown=nodejs:nextjs /app/.env.example ./.env.example
COPY --from=builder --chown=nodejs:nextjs /app/prisma ./prisma

# Drop privileges.
USER nodejs

EXPOSE 3000

# OWASP/enterprise healthcheck probe.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/next", "start"]
