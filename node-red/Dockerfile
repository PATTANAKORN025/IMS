FROM nodered/node-red:4.0.5-22-minimal

WORKDIR /usr/src/node-red

COPY nodered_data/package.json .
RUN npm install --omit=dev --no-fund

# Explicitly set NODE_PATH so /data/settings.js can find the modules
ENV NODE_PATH=/usr/src/node-red/node_modules
