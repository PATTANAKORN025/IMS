FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-fund

COPY server.js ./

USER node
EXPOSE 4000

CMD ["node", "server.js"]
