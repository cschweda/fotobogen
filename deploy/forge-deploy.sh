#!/usr/bin/env bash
# Forge deploy script: paste into Site > Deployments > Deploy Script,
# or run it from the site directory. Pulls the published image; nothing is
# built on the server.
set -euo pipefail

cd "${FORGE_SITE_PATH:-$(dirname "$0")/..}"

git pull origin "${FORGE_SITE_BRANCH:-main}"
mkdir -p data

export PUID="$(id -u)" PGID="$(id -g)"
docker compose -f docker-compose.forge.yml pull
docker compose -f docker-compose.forge.yml up -d
docker image prune -f
