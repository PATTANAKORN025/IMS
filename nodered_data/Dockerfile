FROM nodered/node-red:4.0.5-22-minimal

# Switch to root to install extra dependencies, then switch back
USER root

COPY package.json /tmp/package.json
RUN cd /tmp && npm install --omit=dev --no-fund && \
    mv node_modules /usr/src/node_modules && \
    npm cache clean --force && \
    rm /tmp/package.json && \
    chown -R node-red:node-red /usr/src/node_modules

USER node-red

# Node-RED finds extra modules (net-snmp, pg, etc.) via this path
ENV NODE_RED_EXTRA_NODE_PATH=/usr/src/node_modules
