# syntax=docker/dockerfile:1

FROM node:22.23.1-alpine AS builder

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY game/package.json ./game/
COPY game/frontend/package.json ./game/frontend/
COPY game/backend/package.json ./game/backend/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

COPY game ./game
# The frontend imports backend/engine from its compiled package export.
RUN pnpm --filter backend build
RUN pnpm --filter frontend build
RUN pnpm --filter backend --prod deploy --legacy /app/deploy

FROM node:22.23.1-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=builder /app/deploy ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
