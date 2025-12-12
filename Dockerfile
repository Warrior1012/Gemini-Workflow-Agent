FROM node:18
WORKDIR /app

# Copy package.json so install is faster
COPY backend/package*.json ./backend/

# Install dependencies (use npm install if no lockfile)
RUN cd backend && npm install --production --silent

COPY . .

WORKDIR /app/backend
RUN npm run build || true

ENV PORT 3000
EXPOSE 3000
CMD ["npm", "start"]

