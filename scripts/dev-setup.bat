@echo off
REM Noah Platform - Development Environment Setup Script for Windows

echo 🚀 Setting up Noah Media Asset Management Platform Development Environment...

REM Check if Docker is installed and running
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Check if Docker Compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not available. Please install Docker Compose.
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo 📝 Creating .env file from template...
    copy .env.example .env
    echo ✅ .env file created. Please review and update as needed.
)

REM Create necessary directories
echo 📁 Creating necessary directories...
if not exist "logs" mkdir logs
if not exist "data\postgres" mkdir data\postgres
if not exist "data\redis" mkdir data\redis
if not exist "data\minio" mkdir data\minio
if not exist "data\prometheus" mkdir data\prometheus
if not exist "data\grafana" mkdir data\grafana

REM Pull all required Docker images
echo 🐳 Pulling Docker images...
docker-compose -f docker-compose.dev.yml pull

REM Start the infrastructure services
echo 🔧 Starting infrastructure services...
docker-compose -f docker-compose.dev.yml up -d

REM Wait for services to be ready
echo ⏳ Waiting for services to start up...
timeout /t 30 /nobreak

REM Install Node.js dependencies
echo 📦 Installing Node.js dependencies...
where npm >nul 2>&1
if %errorlevel% equ 0 (
    npm install
    npm run build:packages
) else (
    echo ⚠️  npm not found. Please install Node.js to build the packages.
)

REM Run database migrations
echo 🗃️  Running database migrations...
where npx >nul 2>&1
if %errorlevel% equ 0 (
    cd packages\@noah\db
    npx prisma generate
    npx prisma db push
    cd ..\..\..
) else (
    echo ⚠️  npx not found. Please run 'npx prisma db push' manually in packages/@noah/db
)

echo.
echo 🎉 Noah Platform development environment is ready!
echo.
echo 📊 Services available:
echo   • PostgreSQL (TimescaleDB): localhost:5432
echo   • PgBouncer (Connection Pool): localhost:6432
echo   • Redis: localhost:6379
echo   • Redis Sentinel: localhost:26379
echo   • Kafka: localhost:9092
echo   • Minio (S3): http://localhost:9000
echo   • Prometheus: http://localhost:9090
echo   • Grafana: http://localhost:3001 (admin/noah_grafana_password)
echo   • Jaeger: http://localhost:16686
echo.
echo 🚀 Next steps:
echo   1. Start the API service: cd apps\api ^&^& npm run dev
echo   2. Start the web app: cd apps\web ^&^& npm run dev
echo   3. Start the compression service: cd apps\compression ^&^& cargo run
echo.
echo 🛠️  To stop all services: docker-compose -f docker-compose.dev.yml down
echo 🧹 To reset everything: docker-compose -f docker-compose.dev.yml down -v

pause
