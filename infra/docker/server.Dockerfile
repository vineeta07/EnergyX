# Node.js core API
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev && npm install tsx@4
COPY server/ ./
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
USER node
CMD ["npx", "tsx", "src/index.ts"]
