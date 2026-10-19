# Staging API image. Local fixture only. Not a production runtime.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.34.3 --activate

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml backend/nest-cli.json backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY deploy/staging/db-setup.sh /app/db-setup.sh

RUN pnpm install --frozen-lockfile \
  && chmod +x /app/db-setup.sh

COPY backend/src ./src

# prisma generate reads DATABASE_URL from the schema and does not connect.
ENV DATABASE_URL=postgresql://neighborly:neighborly@localhost:5432/neighborly

RUN pnpm exec prisma generate \
  && pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
