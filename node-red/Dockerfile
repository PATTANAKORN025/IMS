FROM nodered/node-red:4.0.5-22-minimal

# Copy package manifest and install dependencies to a path outside /data
# (the volume mount ./nodered_data:/data shadows /data at runtime)
COPY nodered_data/package.json /tmp/package.json
RUN cd /tmp && npm install --production && \
    mv node_modules /usr/src/node_modules && \
    npm cache clean --force && \
    rm /tmp/package.json

# Node-RED will search this path for extra modules
ENV NODE_RED_EXTRA_NODE_PATH=/usr/src/node_modules
