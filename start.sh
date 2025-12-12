#!/usr/bin/env bash
echo "Starting app manually..."

cd backend

# Install dependencies
npm install

# If your app uses build step (optional)
npm run build || true

# Start the backend
npm start
