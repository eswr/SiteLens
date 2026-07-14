# SiteLens API image (monorepo-aware). Build from the repository root.
# Multi-stage: compile TypeScript in the builder; runtime is plain Node (no tsx).

FROM node:20-bookworm-slim AS build

WORKDIR /app

# Workspace manifests first for better layer caching.
# apps/web package.json is required so npm workspaces resolve; the web app is not copied.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Skip lifecycle scripts so we compile only after sources are copied.
RUN npm ci --ignore-scripts --workspace=apps/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w packages/shared && npm run build -w apps/api

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Production deps only (tsx is a devDependency and is not installed here).
RUN npm ci --omit=dev --ignore-scripts --workspace=apps/api --include-workspace-root

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/db apps/api/db
COPY apps/api/data apps/api/data

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "apps/api"]
