@echo off
setlocal
echo 🚀 Starting YT Alt environment setup...

REM 1. Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Docker is not installed.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
echo ✅ Docker is detected.

REM 2. Build and Pull images
echo 📦 Building and pulling containers... (This may take a while)
docker-compose build
docker-compose pull

echo ---------------------------------------------------
echo 🎉 Setup complete!
echo You can now run 'start.bat' to launch the application.
echo ---------------------------------------------------
pause
