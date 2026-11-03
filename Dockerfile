# fe-hunt server + PWA, for a home server (CasaOS).
#
#   docker build -t fe-hunt .
#   docker run -d --name fe-hunt -p 8787:8787 -v fe-hunt-data:/data \
#     -e FE_HUNT_TOKEN=<long random string> -e DEEPSEEK_API_KEY=<key> fe-hunt
#
# The server refuses to start on 0.0.0.0 without FE_HUNT_TOKEN.

FROM node:22-slim AS build

# better-sqlite3 is native: npm ci uses a prebuilt binary when one matches,
# and compiles with these otherwise (e.g. on an unusual arch).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# HOME=/data puts ~/.flex-me-in (jobs.db, .env, error.log) on the volume.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    HOME=/data \
    HOST=0.0.0.0 \
    PORT=8787

USER node
VOLUME /data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
