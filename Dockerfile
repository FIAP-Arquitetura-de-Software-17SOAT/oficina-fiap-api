FROM node:lts-bookworm-slim AS base
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS prisma
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

FROM prisma AS build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM prisma AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

FROM prisma AS dev
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY test ./test
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM base AS production-deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:lts-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 3000


CMD ["node", "dist/src/main"]
