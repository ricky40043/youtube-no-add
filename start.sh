#!/bin/bash

# YT Alt Start Script for Mac/Linux
set -e

# Detect Docker Compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    DOCKER_COMPOSE_CMD="docker compose"
fi

echo "🚀 Starting YT Alt services..."
$DOCKER_COMPOSE_CMD up -d

echo "---------------------------------------------------"
echo "✅ Application started successfully!"
echo ""
echo "📱 Frontend: http://localhost:5173"
echo "🔌 Backend API: http://localhost:8000/docs"
echo ""
echo "To stop the application, run: $DOCKER_COMPOSE_CMD down"
echo "---------------------------------------------------"
