# Staging frontend image. VITE_API_URL is baked in at build time.
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN test -n "$VITE_API_URL" \
  && pnpm build

FROM nginx:1.27-alpine

COPY deploy/staging/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
