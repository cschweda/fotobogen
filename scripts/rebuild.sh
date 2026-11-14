#!/usr/bin/env bash
# Update a bare-metal (pm2) install to the latest code.
# Building needs more memory than running: on a 1 GB server, add swap first.
set -euo pipefail

cd "$(dirname "$0")/.."

git pull
pnpm install --frozen-lockfile
pnpm build
pm2 reload ecosystem.config.cjs --update-env
