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
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apiuser \
  && mkdir -p /data/tenant-assets && chown -R apiuser:nodejs /data/tenant-assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
# Copy reset script — served at GET /api/v1/agent/reset-script
COPY scripts ./scripts
USER apiuser
EXPOSE 5000
CMD ["node", "dist/server.js"]