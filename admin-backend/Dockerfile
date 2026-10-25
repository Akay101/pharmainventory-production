# Use Node 18 LTS base image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose admin backend port
EXPOSE 8005

# Default environment port
ENV PORT=8005

# Start Admin API server
CMD ["node", "server.js"]
