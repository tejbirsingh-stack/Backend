#!/bin/bash
# Noah Platform - Development Environment Setup Script

set -e

echo "🚀 Setting up Noah Media Asset Management Platform Development Environment..."

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please review and update as needed."
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p data/postgres
mkdir -p data/redis
mkdir -p data/minio
mkdir -p data/prometheus
mkdir -p data/grafana

# Pull all required Docker images
echo "🐳 Pulling Docker images..."
docker-compose -f docker-compose.dev.yml pull

# Start the infrastructure services
echo "🔧 Starting infrastructure services..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U noah_user -d noah_dev; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
until docker-compose -f docker-compose.dev.yml exec -T redis-master redis-cli -a noah_redis_password ping; do
    echo "Waiting for Redis..."
    sleep 2
done

# Wait for Kafka to be ready
echo "⏳ Waiting for Kafka to be ready..."
sleep 30

# Create Minio bucket
echo "🪣 Creating Minio bucket..."
docker run --rm --network noah_noah-network \
    minio/mc config host add noah-minio http://minio:9000 noah_minio_user noah_minio_password
docker run --rm --network noah_noah-network \
    minio/mc mb noah-minio/noah-dev-assets --ignore-existing

# Install Node.js dependencies for all packages
echo "📦 Installing Node.js dependencies..."
if command -v npm &> /dev/null; then
    npm install
    npm run build:packages
else
    echo "⚠️  npm not found. Please install Node.js to build the packages."
fi

# Run database migrations
echo "🗃️  Running database migrations..."
if command -v npx &> /dev/null; then
    cd packages/@noah/db
    npx prisma generate
    npx prisma db push
    cd ../../..
else
    echo "⚠️  npx not found. Please run 'npx prisma db push' manually in packages/@noah/db"
fi

echo ""
echo "🎉 Noah Platform development environment is ready!"
echo ""
echo "📊 Services available:"
echo "  • PostgreSQL (TimescaleDB): localhost:5432"
echo "  • PgBouncer (Connection Pool): localhost:6432"
echo "  • Redis: localhost:6379"
echo "  • Redis Sentinel: localhost:26379"
echo "  • Kafka: localhost:9092"
echo "  • Minio (S3): http://localhost:9000"
echo "  • Prometheus: http://localhost:9090"
echo "  • Grafana: http://localhost:3001 (admin/noah_grafana_password)"
echo "  • Jaeger: http://localhost:16686"
echo ""
echo "🚀 Next steps:"
echo "  1. Start the API service: cd apps/api && npm run dev"
echo "  2. Start the web app: cd apps/web && npm run dev"
echo "  3. Start the compression service: cd apps/compression && cargo run"
echo ""
echo "🛠️  To stop all services: docker-compose -f docker-compose.dev.yml down"
echo "🧹 To reset everything: docker-compose -f docker-compose.dev.yml down -v"
