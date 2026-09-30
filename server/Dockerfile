# Build context is the repo root:  docker build -f server/Dockerfile .
FROM node:20-alpine
RUN apk add --no-cache ffmpeg tini
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server -w shared --include-workspace-root=false
COPY shared shared
COPY server server
WORKDIR /app/server
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/index.ts"]
