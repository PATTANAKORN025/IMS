FROM nodered/node-red:4.0.5-22-minimal

# Switch to root to install extra dependencies, then switch back
USER root

# Same-release Alpine package patching (still an active repo -- confirmed
# live 2026-08-21, `apk update` reached dl-cdn.alpinelinux.org/alpine/v3.20
# and returned real packages, contradicting an earlier "EOSL" assumption).
# This is a patch-level apk upgrade within Alpine 3.20, not a base-image
# tag bump -- resolves the OS-layer CVEs Trivy found (verified: fixes
# openssl/libssl3/libcrypto3 3.3.2-r1 -> 3.3.7-r0, the exact version
# CVE-2026-31789's advisory names) without the compatibility risk of
# switching Alpine major versions or Node-RED image tags.
RUN apk update && apk upgrade --no-cache

COPY package.json /tmp/package.json
RUN cd /tmp && npm install --omit=dev --no-fund && \
    mv node_modules /usr/src/node_modules && \
    npm cache clean --force && \
    rm /tmp/package.json && \
    chown -R node-red:node-red /usr/src/node_modules

USER node-red

# Node-RED finds extra modules (net-snmp, pg, etc.) via this path
ENV NODE_RED_EXTRA_NODE_PATH=/usr/src/node_modules
ENV NODE_PATH=/usr/src/node_modules
