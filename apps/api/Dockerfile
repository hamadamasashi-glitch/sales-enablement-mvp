FROM node:20-bullseye
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src
COPY samples ./samples

RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && npm run start:prod"]
