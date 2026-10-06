# syntax=docker/dockerfile:1

# Прод-образ API. Пишется с первого дня, а не на деплое (§4.2): несовместимости
# должны всплывать сейчас, а не в тот вечер, когда проект выкладывают.
#
# Контекст сборки — корень монорепо, а не apps/api: нужен pnpm-lock.yaml
# и packages/shared.

ARG NODE_VERSION=24-alpine

# ───────────────────────────── манифесты и зависимости ─────────────────────────
FROM node:${NODE_VERSION} AS base
RUN corepack enable pnpm
WORKDIR /repo
ENV PNPM_HOME=/pnpm
ENV CI=true

# Копируются только манифесты: слой с зависимостями переиспользуется, пока
# не поменялся lock-файл.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# ──────────────────────────────── сборка ──────────────────────────────────────
FROM base AS builder
# argon2 — нативный модуль; на musl готовых сборок может не быть,
# поэтому в сборочном слое держим компилятор. В рантайм он не попадает.
RUN apk add --no-cache python3 make g++
RUN pnpm install --frozen-lockfile --filter @moneymap/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @moneymap/api build

# ───────────────────────── только прод-зависимости ────────────────────────────
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
RUN pnpm install --frozen-lockfile --prod --filter @moneymap/api...

# ──────────────────────────────── рантайм ─────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
# libstdc++ нужен скомпилированному argon2.
RUN apk add --no-cache libstdc++ && \
    apk upgrade --no-cache

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

# Структура /repo сохраняется целиком: node_modules у pnpm — это дерево
# символических ссылок на .pnpm, и переносить его по частям нельзя.
WORKDIR /repo/apps/api
COPY --from=prod-deps --chown=node:node /repo /repo
COPY --from=builder --chown=node:node /repo/apps/api/dist ./dist
COPY --from=builder --chown=node:node /repo/apps/api/drizzle ./drizzle

# Непривилегированный пользователь: образ ничего не пишет на диск.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Без init-процесса: Fastify сам обрабатывает SIGTERM (см. src/server.ts),
# а Node как PID 1 этого достаточно.
CMD ["node", "dist/server.js"]
