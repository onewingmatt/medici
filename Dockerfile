# Medici — production image. Builds the client, runs the server.
# bookworm-slim (glibc) so better-sqlite3 uses prebuilt binaries instead of
# needing node-gyp/python in the image (alpine musl requires a full build toolchain).
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Root deps (engine + server)
COPY package.json package-lock.json ./
RUN npm ci
# Client deps
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci

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
RUN npm ci --omit=dev

COPY shared/ shared/
COPY server/ server/
COPY --from=build /app/client/dist client/dist

EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
