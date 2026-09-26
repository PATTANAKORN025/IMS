FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
# apk upgrade: pulls the current Alpine 3.24 branch's patched libssl3/
# libcrypto3 (the base image's own OpenSSL, unrelated to this app's two
# npm dependencies) rather than waiting on the next node:22-alpine release.
#
# Removing npm's own global install after dependency install completes: npm
# is never invoked at runtime (CMD is `node server.js` directly; the
# healthcheck in docker-compose.yaml is also a bare `node -e`), so it is
# dead weight that does nothing here except carry npm's own bundled
# dependencies (tar, pacote, sigstore, brace-expansion, picomatch,
# ip-address) -- none reachable from this service's two exposed routes,
# but removed anyway because a vulnerability in code that can never
# execute is still attack surface worth not shipping.
RUN npm install --omit=dev --no-fund \
  && apk update && apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY server.js ./

USER node
EXPOSE 4000

CMD ["node", "server.js"]
