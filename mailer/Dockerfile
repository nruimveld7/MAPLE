FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY mailer/package*.json ./
RUN npm ci

COPY mailer/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build/index.js"]
