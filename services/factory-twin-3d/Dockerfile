FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-fund

COPY server.js ./
COPY layout.js ./
COPY status-model.js ./
COPY status-api.js ./
COPY mock-status.js ./
COPY config ./config
COPY public ./public

USER node
EXPOSE 4100

CMD ["node", "server.js"]
