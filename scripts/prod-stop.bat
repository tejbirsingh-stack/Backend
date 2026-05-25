@echo off
REM Noah Platform Production Stop Script (Windows)
REM This script will safely stop all production services

echo ===============================
echo Stopping Noah Platform Services
echo ===============================

REM Stop all services gracefully
echo Stopping all services...
docker-compose -f docker-compose.production.yml down

echo ✅ All services stopped successfully!
echo.
echo Data volumes are preserved.
echo To completely reset and remove all data, run:
echo docker-compose -f docker-compose.production.yml down -v

pause
