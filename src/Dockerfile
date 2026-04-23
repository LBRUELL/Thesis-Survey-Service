FROM node:20-alpine AS builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./

# Copy the built React app so Express can serve it
COPY --from=builder /app/client/dist ../client/dist

EXPOSE 3001
CMD ["node", "server.js"]
