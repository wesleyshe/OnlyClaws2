FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npx next build

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Push schema to DB then start server
COPY docker-entrypoint.sh ./
CMD ["sh", "docker-entrypoint.sh"]
