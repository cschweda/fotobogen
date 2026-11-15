# Fotobogen. Debian slim rather than Alpine, so better-sqlite3 (and later
# sharp) use their prebuilt glibc binaries and nothing is compiled.
# better-sqlite3 ships those binaries inside its package; it is deliberately
# not in pnpm's build list, which would compile it from source instead.

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=5150
WORKDIR /app

# The server build is self-contained. The CLI (scripts/) shares the plain
# TypeScript in server/core and shared/, and finds better-sqlite3 through
# the node_modules link.
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server/core ./server/core
COPY --from=build /app/server/db/migrations ./server/db/migrations
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/fotobogen.config.js ./fotobogen.config.js
RUN ln -s /app/.output/server/node_modules /app/node_modules \
 && mkdir /data && chown 1000:1000 /data

# Compose overrides this with the host user's UID and GID so files in a
# bind-mounted data directory belong to that user.
USER 1000:1000
VOLUME /data
EXPOSE 5150

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5150) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# The launcher runs the preflight check, then the server.
CMD ["node", "scripts/start.mjs"]
