# syntax=docker/dockerfile:1
# Node 26 = current LTS ("Lithium"). Node 25+ no longer bundles corepack,
# so pnpm is installed explicitly with npm and pinned.
ARG NODE_VERSION=26
ARG PNPM_VERSION=12.23.0

# ---- base: node + pnpm (glibc image so node_modules also works in the Playwright image)
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=true
# pnpm >= 12 ships a native binary; `pnpm --version` fails the build if the download was truncated
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm --version && npm cache clean --force
WORKDIR /app

# ---- dev: source is bind-mounted; node_modules/.next live in named volumes
FROM base AS dev
COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
# Pre-create the mount points owned by uid 1000 (node) so named volumes
# are initialised with the right owner and no root-owned files appear.
RUN chmod +x /usr/local/bin/dev-entrypoint.sh \
    && mkdir -p /app/node_modules /app/.next \
    && chown -R node:node /app
USER node
# store inside the node_modules volume so pnpm can hard-link (same filesystem)
ENV NODE_ENV=development \
    npm_config_store_dir=/app/node_modules/.pnpm-store
EXPOSE 3000
ENTRYPOINT ["dev-entrypoint.sh"]
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

# ---- deps / build / prod
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# NODE_ENV=production is required: `next build` in development mode fails on /_global-error
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN pnpm build \
    # the migrate step runs without node_modules or tsx: bundle scripts/db-migrate.ts (drizzle + postgres inside) into one file
    && pnpm exec esbuild scripts/db-migrate.ts --bundle --platform=node --format=esm --target=node26 \
         --outfile=/app/migrate/migrate.mjs --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" \
    && cp -r src/db/migrations /app/migrate/migrations

# Runtime image: Next standalone server + lessons (content/) + migrate bundle. No pnpm, no dev dependencies.
FROM node:${NODE_VERSION}-slim AS prod
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# lessons and vocabulary are read from disk at runtime (src/lib/content/repo.ts: <cwd>/content); server.js runs with cwd=/app
COPY --from=build --chown=node:node /app/content ./content
COPY --from=build --chown=node:node /app/migrate/migrate.mjs ./migrate.mjs
COPY --from=build --chown=node:node /app/migrate/migrations ./migrations
USER node
EXPOSE 3000
# 127.0.0.1, not localhost: on Node 26 "localhost" can resolve to ::1 while the server listens on IPv4
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
