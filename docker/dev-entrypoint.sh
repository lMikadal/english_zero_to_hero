#!/bin/sh
# Keep node_modules (named volume) in sync with package.json / lockfile, then run the command.
# A stamp file avoids touching the network when nothing changed. The stamp also covers the
# Node and pnpm versions, so bumping either in the Dockerfile triggers a reinstall.
set -e
if [ -f package.json ]; then
  stamp=$( { node -v; pnpm -v; cat package.json pnpm-lock.yaml pnpm-workspace.yaml 2>/dev/null; } | sha256sum | cut -d' ' -f1)
  if [ "$(cat node_modules/.install-stamp 2>/dev/null)" != "$stamp" ]; then
    # Several containers share this volume (app, `make test`, e2e): install under a lock,
    # and re-check the stamp once we hold it in case another container just finished.
    (
      flock 9
      if [ "$(cat node_modules/.install-stamp 2>/dev/null)" != "$stamp" ]; then
        if [ -f pnpm-lock.yaml ]; then
          pnpm install --frozen-lockfile --prefer-offline
        else
          pnpm install --prefer-offline
        fi
        # the dev cache (.next volume) goes stale when packages change and makes the browser reload in a loop: empty it
        # (contents only, the directory is a volume mount point)
        find /app/.next -mindepth 1 -delete 2>/dev/null || true
        echo "$stamp" > node_modules/.install-stamp
      fi
    ) 9> node_modules/.install.lock
  fi
fi
exec "$@"
