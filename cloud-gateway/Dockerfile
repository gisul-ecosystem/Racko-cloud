FROM node:20-alpine AS builder
WORKDIR /app
COPY cloud-gateway/package.json ./
COPY cloud-gateway/package-lock.json* ./
COPY cloud-gateway/tsconfig.json ./
RUN npm ci
COPY cloud-gateway/src ./src
RUN npm run build
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 gwuser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY cloud-gateway/package.json ./
USER gwuser
EXPOSE 4000
CMD ["node", "dist/server.js"]