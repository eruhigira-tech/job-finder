FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js cache.js normalize.js ./
COPY public ./public

# Do not run as root
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
