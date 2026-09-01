# Build stage
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma on Alpine Linux
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Run prisma generate directly via node to bypass shell permission issues
RUN node node_modules/prisma/build/index.js generate

# Production stage
FROM node:20-alpine AS runner

# Install OpenSSL runtime for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push && node src/app.js"]
