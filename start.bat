@echo off
echo 🚀 Starting YT Alt services...

docker-compose up -d

echo ---------------------------------------------------
echo ✅ Application started successfully!
echo.
echo 📱 Frontend: http://localhost:5173
echo 🔌 Backend API: http://localhost:8000/docs
echo.
echo To stop the application, run: docker-compose down
echo ---------------------------------------------------
pause
