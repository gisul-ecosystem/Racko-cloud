FROM node:20-alpine AS builder
 
WORKDIR /app
 
COPY package.json package-lock.json ./
RUN npm ci
 
COPY . .
 
ARG NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_TENANT_DEV_DOMAIN
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV NEXT_PUBLIC_TENANT_DEV_DOMAIN=${NEXT_PUBLIC_TENANT_DEV_DOMAIN}
 
RUN npm run build
 
FROM node:20-alpine AS runner
 
WORKDIR /app
 
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
 
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs
 
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
 
USER nextjs
 
EXPOSE 3000
 
CMD ["node", "server.js"]