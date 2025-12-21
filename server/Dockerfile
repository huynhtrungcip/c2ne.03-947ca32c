FROM node:18-alpine

WORKDIR /app

# Install dependencies for better-sqlite3 and curl for healthcheck
RUN apk add --no-cache python3 make g++ curl

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY index.js ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/soc_events.db
ENV PORT=3001
ENV WS_PORT=3002

# Expose ports
EXPOSE 3001 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "index.js"]
