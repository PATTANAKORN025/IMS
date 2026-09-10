FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-fund

COPY server.js ./
COPY lib ./lib
COPY public ./public

# private/ is deliberately NOT copied here -- it holds gitignored, host-
# only data (a real per-device layout file and/or reference image in a
# private production environment; nothing at all in this public repo's own
# checkout). Baking it in via COPY would embed whatever happens to be on
# the build host's disk into a distributable image layer, defeating the
# entire public-engine/private-data split. It is mounted read-only at
# runtime instead -- see docker-compose.yaml's factory-twin-3d volumes.
RUN mkdir -p private

USER node
EXPOSE 4100

CMD ["node", "server.js"]
