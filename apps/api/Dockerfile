FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
COPY turbo.json ./
COPY config/ ./config/

# Install dependencies
RUN npm ci

# Copy source code
COPY apps/api/ ./apps/api/

# Build the app
RUN npm run build --workspace=@noah/api

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package files and dependencies from builder
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/ ./packages/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built code from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Command to run the app
CMD ["node", "apps/api/dist/main.js"]
