# Build context is the repo root:  docker build -f infra/nginx/Dockerfile .
FROM node:20-alpine AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci -w client -w shared --include-workspace-root=false
COPY shared shared
COPY client client
RUN npm run build -w client

FROM nginx:1.27-alpine
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=client /app/client/dist /usr/share/nginx/html
