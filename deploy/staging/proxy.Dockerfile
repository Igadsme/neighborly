FROM caddy:2.10-alpine

RUN apk add --no-cache curl

COPY deploy/staging/Caddyfile /etc/caddy/Caddyfile
