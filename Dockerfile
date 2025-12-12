# Simple Node Dockerfile for repo with backend/ folder
FROM node:18

# Create app dir
WORKDIR /app

# Copy package.json first for faster installs
COPY backend/package*.json ./backend/

# Install dependencies inside backend
RUN cd backend && npm ci

# Copy whole repo
COPY . .

# Set working dir to backend (where your app lives)
WORKDIR /app/backend

# Optional build (if your project has a build step)
RUN npm run build || true

# Railway will set PORT env var; expose a default
ENV PORT 3000
EXPOSE 3000

# Start the app (make sure backend's package.json has a "start" script)
CMD ["npm", "start"]
