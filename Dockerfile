# Portable image — works on Render, Fly.io, Koyeb, Railway, etc.
FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# App source
COPY . .

ENV NODE_ENV=production
# Most hosts inject $PORT; the server already reads process.env.PORT (falls back to 3000).
EXPOSE 3000

CMD ["node", "server/index.js"]
