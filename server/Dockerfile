FROM node:18-alpine

WORKDIR /app

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ curl

COPY package*.json ./
RUN npm ci --only=production

COPY index.js ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Change database path to use volume
ENV DB_PATH=/app/data/soc_events.db

EXPOSE 3001 3002

CMD ["node", "index.js"]
