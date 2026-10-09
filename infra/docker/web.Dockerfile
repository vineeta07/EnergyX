# Next.js frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
COPY frontend/ ./
RUN npm ci && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["npm", "run", "start"]
