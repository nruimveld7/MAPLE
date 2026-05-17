FROM node:22-alpine AS builder
WORKDIR /app

ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH

COPY applets/workouts/package*.json ./
RUN npm ci

COPY applets/workouts/ ./
COPY shared-shell/ /shared-shell/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build"]
