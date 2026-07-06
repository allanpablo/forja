# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Copy monorepo files
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages

# Install dependencies
RUN npm ci

# Build all packages
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/packages/apps/frontend/.next ./packages/apps/frontend/.next
COPY --from=builder /app/packages/apps/backend/dist ./packages/apps/backend/dist

# Expose ports
EXPOSE 3000 3001

# Start both services
CMD ["sh", "-c", "npm run start --workspace=frontend & npm run start --workspace=backend"]
