#!/bin/bash

# YT Alt Setup Script for Mac/Linux
set -e

echo "🚀 Starting YT Alt environment setup..."

# 1. Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed."
    echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop/"
    exit 1
fi

echo "✅ Docker is installed."

# 2. Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "⚠️  'docker-compose' command not found, checking 'docker compose'..."
    if ! docker compose version &> /dev/null; then
        echo "❌ Error: Docker Compose is not installed."
        exit 1
    fi
    DOCKER_COMPOSE_CMD="docker compose"
else
    DOCKER_COMPOSE_CMD="docker-compose"
fi

echo "✅ Docker Compose detected."

# 3. Build and Pull images
echo "📦 Building and pulling containers... (This may take a while)"
$DOCKER_COMPOSE_CMD build
$DOCKER_COMPOSE_CMD pull

echo "---------------------------------------------------"
echo "🎉 Setup complete!"
echo "You can now run './start.sh' to launch the application."
echo "---------------------------------------------------"
