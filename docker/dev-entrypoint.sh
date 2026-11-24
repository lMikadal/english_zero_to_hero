#!/bin/sh
# Keep node_modules (named volume) in sync with package.json / lockfile, then run the command.
set -e
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile --prefer-offline
  else
    pnpm install --prefer-offline
  fi
fi
exec "$@"
