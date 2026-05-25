@echo off
REM Noah Platform Production Startup Script (Windows)
REM This script will deploy the Noah platform in production mode

echo ===================================
echo Noah Platform Production Deployment
echo ===================================

REM Check if .env.production exists
if not exist ".env.production" (
    echo ERROR: .env.production file not found!
    echo Please copy .env.production.example to .env.production and configure it
    pause
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running or not accessible
    pause
    exit /b 1
)

REM Pull latest images
echo Pulling latest Docker images...
docker-compose -f docker-compose.production.yml pull

REM Build custom images
echo Building application images...
docker-compose -f docker-compose.production.yml build

REM Initialize Kong database
echo Initializing Kong database...
docker-compose -f docker-compose.production.yml run --rm api-gateway kong migrations bootstrap --yes

REM Start all services
echo Starting all services...
docker-compose -f docker-compose.production.yml --env-file .env.production up -d

REM Wait for services to be ready
echo Waiting for services to start...
timeout /t 30 >nul

REM Run Kong configuration script
echo Configuring Kong API Gateway...
call infrastructure\scripts\setup-kong.bat

REM Check service health
echo Checking service health...
docker-compose -f docker-compose.production.yml ps | findstr "postgres-primary" >nul && echo ✅ postgres-primary is running || echo ❌ postgres-primary is not running
docker-compose -f docker-compose.production.yml ps | findstr "api" >nul && echo ✅ api is running || echo ❌ api is not running
docker-compose -f docker-compose.production.yml ps | findstr "web" >nul && echo ✅ web is running || echo ❌ web is not running
docker-compose -f docker-compose.production.yml ps | findstr "api-gateway" >nul && echo ✅ api-gateway is running || echo ❌ api-gateway is not running

echo.
echo Production deployment complete!
echo.
echo Services available at:
echo - Web App: http://localhost:8000/
echo - API: http://localhost:8000/api
echo - Kong Admin: http://localhost:8001
echo - Grafana: http://localhost:3001 (if monitoring enabled)
echo.
echo To view logs: docker-compose -f docker-compose.production.yml logs -f [service_name]
echo To stop services: docker-compose -f docker-compose.production.yml down
echo.
echo 🎉 Noah Platform is now running in production mode!

pause
