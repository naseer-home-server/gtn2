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
COPY ai-simulation/package.json ./ai-simulation/
COPY ai-simulation/frontend/package.json ./ai-simulation/frontend/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

COPY game/backend ./game/backend
COPY game/frontend/src/components/game-activity ./game/frontend/src/components/game-activity
COPY ai-simulation ./ai-simulation
RUN pnpm --filter backend build && \
    pnpm --filter ai-simulation-ui build && \
    pnpm --filter ai-simulation build && \
    pnpm --filter ai-simulation --prod deploy --legacy /app/deploy

FROM node:22.23.1-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget && mkdir /data && chown node:node /data
COPY --from=builder /app/deploy ./
COPY --from=builder /app/ai-simulation/frontend/dist ./public
ENV NODE_ENV=production
ENV SIMULATION_PUBLIC_DIR=/app/public
ENV SIMULATION_DATA_DIR=/data
EXPOSE 3010
USER node
CMD ["node", "dist/index.js"]
