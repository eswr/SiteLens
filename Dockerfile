# SiteLens API image (monorepo-aware). Build from the repository root.
FROM node:20-bookworm-slim

WORKDIR /app

# Workspace manifests first for better layer caching.
# apps/web package.json is required so npm workspaces resolve; the web app is not copied.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Install API + shared (+ root). tsx is a runtime dependency of the API.
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "apps/api"]
