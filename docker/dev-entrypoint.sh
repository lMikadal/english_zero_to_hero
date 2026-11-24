#!/bin/sh
# Keep node_modules (named volume) in sync with package.json / lockfile, then run the command.
# A stamp file avoids touching the network when nothing changed.
set -e
if [ -f package.json ]; then
  stamp=$(cat package.json pnpm-lock.yaml 2>/dev/null | sha256sum | cut -d' ' -f1)
  if [ "$(cat node_modules/.install-stamp 2>/dev/null)" != "$stamp" ]; then
    if [ -f pnpm-lock.yaml ]; then
      pnpm install --frozen-lockfile --prefer-offline
    else
      pnpm install --prefer-offline
    fi
    echo "$stamp" > node_modules/.install-stamp
  fi
fi
exec "$@"
