@echo off
setlocal

echo =======================================
echo   Noah Platform Development Environment
echo =======================================
echo.

:: Check if Docker is running
docker info > NUL 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [31mDocker is not running! Please start Docker and try again.[0m
  exit /b 1
)

:: Setup .env file if it doesn't exist
if not exist .\apps\api\.env (
  echo Setting up API environment variables...
  copy .\apps\api\.env.example .\apps\api\.env
  echo Created .env file for API
)

if not exist .\apps\web\.env (
  echo Setting up Web environment variables...
  copy .\apps\web\.env.example .\apps\web\.env
  echo Created .env file for Web app
)

:: Start the services with docker-compose
echo Starting development environment...
docker-compose -f docker-compose.dev.yml up -d

:: Wait for services to be ready
echo Waiting for services to be ready...
timeout /t 5 /nobreak > NUL

:: Run database migrations
echo Running database migrations...
docker-compose -f docker-compose.dev.yml exec api npm run db:migrate

:: Print success message
echo.
echo =======================================
echo   Noah Platform Ready!
echo =======================================
echo.
echo Services available at:
echo - Web Interface: http://localhost:3000
echo - API: http://localhost:3001
echo - MinIO Console: http://localhost:9001
echo - Grafana: http://localhost:3001
echo - Jaeger UI: http://localhost:16686
echo.
echo Default credentials:
echo - MinIO: noah_minio_user / noah_minio_password
echo - Grafana: admin / noah_grafana_password
echo.
echo To stop the environment: docker-compose -f docker-compose.dev.yml down
echo.
