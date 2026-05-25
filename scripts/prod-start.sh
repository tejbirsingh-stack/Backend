#!/bin/bash

# Noah Platform Production Startup Script
# This script will deploy the Noah platform in production mode

set -e  # Exit on any error

echo "==================================="
echo "Noah Platform Production Deployment"
echo "==================================="

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "ERROR: .env.production file not found!"
    echo "Please copy .env.production.example to .env.production and configure it"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running or not accessible"
    exit 1
fi

# Pull latest images (if needed)
echo "Pulling latest Docker images..."
docker-compose -f docker-compose.production.yml pull

# Build custom images
echo "Building application images..."
docker-compose -f docker-compose.production.yml build

# Initialize Kong database (migration)
echo "Initializing Kong database..."
docker-compose -f docker-compose.production.yml run --rm api-gateway kong migrations bootstrap --yes

# Start all services
echo "Starting all services..."
docker-compose -f docker-compose.production.yml --env-file .env.production up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 30

# Run Kong configuration script
echo "Configuring Kong API Gateway..."
./infrastructure/scripts/setup-kong.sh

# Check service health
echo "Checking service health..."
services=("postgres-primary" "api" "web" "api-gateway")

for service in "${services[@]}"; do
    if docker-compose -f docker-compose.production.yml ps | grep -q "$service.*Up"; then
        echo "✅ $service is running"
    else
        echo "❌ $service is not running"
        echo "Check logs with: docker-compose -f docker-compose.production.yml logs $service"
    fi
done

# Show running services
echo ""
echo "Production deployment complete!"
echo ""
echo "Services available at:"
echo "- Web App: http://localhost:8000/"
echo "- API: http://localhost:8000/api"
echo "- Kong Admin: http://localhost:8001"
echo "- Grafana: http://localhost:3001 (if monitoring enabled)"
echo ""
echo "To view logs: docker-compose -f docker-compose.production.yml logs -f [service_name]"
echo "To stop services: docker-compose -f docker-compose.production.yml down"
echo ""
echo "🎉 Noah Platform is now running in production mode!"
