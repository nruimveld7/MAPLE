FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH

COPY auth/package*.json ./
RUN npm ci

COPY auth/ ./
COPY shared-shell/ /shared-shell/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

ENV HOST=0.0.0.0
ENV PORT=3000
ENV MAILER_URL=http://mailer:3000
ENV MAILER_INTERNAL_API_KEY=

EXPOSE 3000
CMD ["node", "build"]
