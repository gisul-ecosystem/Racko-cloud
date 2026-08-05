FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs automation

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json app.js ./
COPY src ./src

USER automation

EXPOSE 3006

CMD ["node", "app.js"]
