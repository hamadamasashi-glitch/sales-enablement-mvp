FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js"]
