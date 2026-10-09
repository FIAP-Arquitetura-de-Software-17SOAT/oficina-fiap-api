FROM node:24.13.0-bookworm-slim AS base
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS prisma
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src/shared/identity/login-credentials.ts ./src/shared/identity/login-credentials.ts
RUN npx prisma generate
RUN npx ts-node --transpile-only -e "require('./prisma/seed')"

FROM prisma AS build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM build AS seeder
ENV PRISMA_CLIENT_MODULE=/app/dist/generated/prisma/client.js
USER node
CMD ["./node_modules/.bin/ts-node", "--transpile-only", "-e", "require('./prisma/seed').runSeed().catch((e) => { console.error(e); process.exit(1); })"]

FROM prisma AS migrator
# Retry limitado: um blip de rede entre containers não pode derrubar o
# `docker compose up` inteiro. Cinco tentativas com 3s de intervalo cobrem a
# indisponibilidade transitória; erro real de migration ainda falha, só que
# depois de imprimir a causa cinco vezes.
USER node
CMD ["sh", "-c", "for i in 1 2 3 4 5; do ./node_modules/.bin/prisma migrate deploy && exit 0; echo \"tentativa $i falhou, aguardando o banco...\"; sleep 3; done; echo 'migrate falhou apos 5 tentativas'; exit 1"]

FROM prisma AS dev
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY test ./test
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM base AS production-deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node --from=production-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package*.json ./

EXPOSE 3000

USER node
CMD ["node", "dist/src/main"]
