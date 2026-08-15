# Medici — production image. Builds the client, runs the server.
# bookworm-slim (glibc) so better-sqlite3's bundled prebuilt binary loads
# (prebuilds/linux-x64.node) — no node-gyp/python needed.
# --ignore-scripts everywhere: npm 10 auto-rebuilds better-sqlite3 via
# node-gyp with this npm-11-generated lockfile; the binary is in the tarball,
# and esbuild ships platform binaries via optionalDependencies.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Root deps (engine + server)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# Client deps
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci --ignore-scripts

# Sources
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build the client bundle
RUN cd client && npm run build

# --- runtime ---
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY shared/ shared/
COPY server/ server/
COPY --from=build /app/client/dist client/dist

EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
