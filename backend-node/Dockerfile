# Production API image
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first so code changes reuse the cached layer
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p tmp/uploads && chown -R node:node tmp

# Never run as root inside the container
USER node

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
