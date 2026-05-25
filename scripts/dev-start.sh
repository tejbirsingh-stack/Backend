#!/bin/bash

# Print with color
print_blue() {
  echo -e "\e[34m$1\e[0m"
}

print_green() {
  echo -e "\e[32m$1\e[0m"
}

print_red() {
  echo -e "\e[31m$1\e[0m"
}

# Header
print_blue "======================================="
print_blue "  Noah Platform Development Environment"
print_blue "======================================="
echo

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  print_red "Docker is not running! Please start Docker and try again."
  exit 1
fi

# Setup .env file if it doesn't exist
if [ ! -f ./apps/api/.env ]; then
  print_blue "Setting up API environment variables..."
  cp ./apps/api/.env.example ./apps/api/.env
  print_green "Created .env file for API"
fi

if [ ! -f ./apps/web/.env ]; then
  print_blue "Setting up Web environment variables..."
  cp ./apps/web/.env.example ./apps/web/.env
  print_green "Created .env file for Web app"
fi

# Start the services with docker-compose
print_blue "Starting development environment..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
print_blue "Waiting for services to be ready..."
sleep 5

# Run database migrations
print_blue "Running database migrations..."
docker-compose -f docker-compose.dev.yml exec api npm run db:migrate

# Print success message
print_green "======================================="
print_green "  Noah Platform Ready!"
print_green "======================================="
echo
print_green "Services available at:"
print_green "- Web Interface: http://localhost:3000"
print_green "- API: http://localhost:3001"
print_green "- MinIO Console: http://localhost:9001"
print_green "- Grafana: http://localhost:3001"
print_green "- Jaeger UI: http://localhost:16686"
echo
print_green "Default credentials:"
print_green "- MinIO: noah_minio_user / noah_minio_password"
print_green "- Grafana: admin / noah_grafana_password"
echo
print_green "To stop the environment: docker-compose -f docker-compose.dev.yml down"
echo
