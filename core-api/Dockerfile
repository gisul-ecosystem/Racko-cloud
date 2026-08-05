FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TENANT_ASSETS_VOLUME_PATH=/data/tenant-assets

# Agent auto-update — baked in at build time by CI so the running container
# always knows the current agent version without any .env patching.
# Defaults to empty string (disables auto-update) if not provided.
ARG AGENT_VERSION=""
ARG AGENT_CHECKSUM_WINDOWS=""
ARG AGENT_CHECKSUM_LINUX=""
ARG AGENT_CHECKSUM_DARWIN=""
ENV AGENT_VERSION=$AGENT_VERSION
ENV AGENT_CHECKSUM_WINDOWS=$AGENT_CHECKSUM_WINDOWS
ENV AGENT_CHECKSUM_LINUX=$AGENT_CHECKSUM_LINUX
ENV AGENT_CHECKSUM_DARWIN=$AGENT_CHECKSUM_DARWIN

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apiuser \
  && mkdir -p /data/tenant-assets && chown -R apiuser:nodejs /data/tenant-assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/utils/email/assets ./dist/utils/email/assets
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
# Copy reset script — served at GET /api/v1/agent/reset-script
COPY scripts ./scripts
USER apiuser
EXPOSE 5000
CMD ["node", "dist/server.js"]