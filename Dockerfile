# Stellio UI — production image.
#
# SvelteKit builds with @sveltejs/adapter-node, so the image only has to run
# `node build/index.js`. Two stages keep the runtime layer free of dev
# dependencies, compilers and build output the server never reads.
#
# Both stages pin Node 22: better-sqlite3 13 is built for Node >= 22 and
# segfaults when loaded by Node 20. The build stage installs it (see below), so
# the runtime stage inherits the binding with the rest of node_modules.
#
# Both stages sit on Alpine rather than Debian slim, which is what an image scan
# asked for: debian:12-slim contributed eight high-severity advisories to the old
# image (util-linux, perl and zlib, all still unfixed downstream), the Alpine
# base reports none, and the image shrinks from 259 MB to 201 MB. Nothing here
# needs glibc: better-sqlite3 is the only native module, and its tarball ships a
# linuxmusl-x64/arm64 prebuild next to the glibc ones, so musl is a first-class
# target rather than a fallback.

# ---------------------------------------------------------------------------
# Build stage: dependencies + `vite build`.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Toolchain for better-sqlite3, the tree's only native module: npm runs
# `node-gyp rebuild` for it on install, and that `gyp configure` step needs
# python3 — dropping this line makes `npm ci` fail right there. At runtime the
# binding that loads is the linuxmusl-x64 one shipped in the tarball
# (prebuilds/), so this is a build-time requirement, not a compiled artifact the
# server depends on. Only this stage needs it — the runtime stage copies the
# resulting node_modules and keeps no compilers.
RUN apk add --no-cache python3 make g++

# Copied on their own so a source-only change reuses the dependency layer.
# `.npmrc` carries `engine-strict=true`, which must stay in the image build.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
# SvelteKit validates the names declared in `src/env.ts` (STELLIO_HOST,
# STELLIO_PORT) against `.env` while building and fails if the file is absent,
# so give it the example values. They are only build-time placeholders: the
# server reads the real ones from the environment at startup, and this file is
# never copied into the runtime image (see the `.dockerignore` note on `.env`).
RUN cp .env.example .env
# `npm prune` leaves only the packages the server needs at runtime
# (better-sqlite3, axios, dotenv) in node_modules.
RUN npm run build && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Runtime stage: the built server, its production dependencies and /data.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0 \
	STELLIO_DB_PATH=/data/stellio-ui.db

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Strip the base image's package managers: the server only ever runs `node
# build/index.js` and no install step happens at runtime. npm is more than dead
# weight here — its own bundled dependency tree (brace-expansion, pacote,
# sigstore, …) accounted for eleven of the high-severity advisories an image scan
# reported, none of them reachable from this app. corepack and the bundled yarn
# go for the same reason; the `node` binary and its own libs are untouched, so
# the docker-entrypoint.sh that ships with the base image keeps working.
RUN rm -rf /usr/local/lib/node_modules/npm \
	/usr/local/lib/node_modules/corepack \
	/opt/yarn-v1.22.22 \
	/usr/local/bin/npm /usr/local/bin/npx \
	/usr/local/bin/corepack \
	/usr/local/bin/yarn /usr/local/bin/yarnpkg

# /data holds the SQLite file (mount a volume there, see compose.yaml). Only
# /data needs to be writable — /app is read-only at runtime, so `node` just
# needs to read it and the ownership of node_modules can stay as-is.
RUN mkdir -p /data && chown node:node /data

# The image runs unprivileged; the node:22 image already ships this user.
USER node

EXPOSE 3000
VOLUME ["/data"]

# `/` is reachable even before a broker is configured (the connection guardrail
# warns inline instead of failing), so it is safe as a liveness probe. Exec form
# on purpose: no shell, so `${...}`/backticks cannot be expanded by anything.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD ["node", "-e", "const p = process.env.PORT || 3000; fetch('http://127.0.0.1:' + p + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "build/index.js"]