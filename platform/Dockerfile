FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH

COPY platform/package*.json ./
RUN npm ci

COPY platform/ ./
COPY shared-shell/ /shared-shell/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl gnupg \
	&& install -m 0755 -d /etc/apt/keyrings \
	&& curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
	&& chmod a+r /etc/apt/keyrings/docker.asc \
	&& . /etc/os-release \
	&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends docker-ce-cli \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

ENV HOST=0.0.0.0
ENV PORT=3000
ENV BODY_SIZE_LIMIT=2M

EXPOSE 3000
CMD ["node", "build"]
