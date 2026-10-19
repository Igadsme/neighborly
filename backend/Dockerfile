FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile && pnpm prisma:generate
COPY nest-cli.json tsconfig.json ./
COPY src ./src
RUN pnpm exec tsc --noEmit && pnpm build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate \
  && groupadd --system neighborly \
  && useradd --system --gid neighborly --create-home neighborly
WORKDIR /app
COPY --from=build --chown=neighborly:neighborly /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=neighborly:neighborly /app/node_modules ./node_modules
COPY --from=build --chown=neighborly:neighborly /app/dist ./dist
COPY --from=build --chown=neighborly:neighborly /app/prisma ./prisma
USER neighborly
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

