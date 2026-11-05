# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# WorkoutApp coach backend image.
#
# Build context is the REPO ROOT, not server/ — server/tsconfig.json compiles the
# shared mobile contracts (src/types/workout.ts, src/db/catalogData.ts), so those
# files must be reachable at their repo-relative paths during the build.
#
#   docker build -f server/Dockerfile -t workout-backend .
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stage 1 — compile the TypeScript API
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /build

# The server has no runtime dependencies (node:http + node:sqlite), so the only
# build dependencies are the compiler and Node's type definitions. They are
# pinned to the runtime's Node major so tsc cannot accept APIs that the
# production image does not ship.
ARG TYPESCRIPT_VERSION=~6.0.3
ARG NODE_TYPES_VERSION=~24.0.0
RUN npm install --no-save --no-package-lock \
      "typescript@${TYPESCRIPT_VERSION}" \
      "@types/node@${NODE_TYPES_VERSION}"

# Mirror the two shared files at their repo-relative paths: tsconfig.json sets
# rootDir ".." and includes "../src/types/workout.ts" + "../src/db/catalogData.ts".
# Compiled output therefore lands in server/dist/{server/src,src/...}.
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
COPY src/types/workout.ts ./src/types/workout.ts
COPY src/db/catalogData.ts ./src/db/catalogData.ts

RUN ./node_modules/.bin/tsc -p server/tsconfig.json

# ---------------------------------------------------------------------------
# Stage 2 — production runtime (minimal, no build tooling, no dependencies)
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0

# server/src/server.ts derives SERVER_ROOT as `__dirname/../../..`, i.e. /app/server,
# and resolves the database and admin web from there. Keep the compiled layout
# identical to the repo: dist/server/src/..., public/admin, data.
COPY --from=build --chown=node:node /build/server/dist ./server/dist
COPY --chown=node:node server/public/admin ./server/public/admin

# The bind-mounted ./data directory replaces this one at runtime; creating it here
# keeps the image runnable on its own (anonymous volume / non-mounted dry runs).
RUN mkdir -p /app/server/data && chown -R node:node /app/server

USER node

EXPOSE 4000

# Uses Node's built-in fetch — the slim image has no curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(function (r) { process.exit(r.ok ? 0 : 1); }).catch(function () { process.exit(1); })"

CMD ["node", "server/dist/server/src/index.js"]