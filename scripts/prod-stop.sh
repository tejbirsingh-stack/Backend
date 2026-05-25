#!/bin/bash

# Noah Platform Production Stop Script
# This script will safely stop all production services

echo "==============================="
echo "Stopping Noah Platform Services"
echo "==============================="

# Stop all services gracefully
echo "Stopping all services..."
docker-compose -f docker-compose.production.yml down

# Optionally remove volumes (uncomment if you want to clean everything)
# echo "Removing volumes..."
# docker-compose -f docker-compose.production.yml down -v

echo "✅ All services stopped successfully!"
echo ""
echo "Data volumes are preserved."
echo "To completely reset and remove all data, run:"
echo "docker-compose -f docker-compose.production.yml down -v"
