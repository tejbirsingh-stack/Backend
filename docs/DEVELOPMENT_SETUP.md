# Noah Platform Development Environment

This document provides instructions for setting up and running the Noah Platform development environment using Docker Compose.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) installed and running
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)
- Git

## Development Environment

### Quick Start

To start the entire development environment with a single command, run:

**On Linux/macOS:**
```bash
./scripts/dev-start.sh
```

**On Windows:**
```cmd
scripts\dev-start.bat
```

This script will:
1. Set up environment variables
2. Start all services using Docker Compose
3. Run database migrations
4. Display available service URLs and credentials

### Manual Setup

If you prefer to set up the environment manually:

1. Create environment variable files:
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

2. Start the Docker Compose environment:
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. Run database migrations:
   ```bash
   docker-compose -f docker-compose.dev.yml exec api npm run db:migrate
   ```

## Production Environment

For production deployment, use the production Docker Compose configuration:

### Production Quick Start

**On Linux/macOS:**
```bash
./scripts/prod-start.sh
```

**On Windows:**
```cmd
scripts\prod-start.bat
```

### Production Manual Setup

1. Copy and configure the production environment file:
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with your secure credentials
   ```

2. Start production services:
   ```bash
   docker-compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

3. Initialize Kong API Gateway:
   ```bash
   ./infrastructure/scripts/setup-kong.sh  # Linux/macOS
   # OR
   infrastructure\scripts\setup-kong.bat   # Windows
   ```

### Production Services

The production environment includes:
- **Kong API Gateway** (ports 8000, 8443, 8001)
- **PostgreSQL Primary/Replica** with TimescaleDB
- **API Service** with authentication and media processing
- **Web Frontend** served through Nginx
- **Redis** for caching and sessions
- **Kafka** for event streaming
- **ElasticSearch** for search and analytics
- **Monitoring stack** (Prometheus, Grafana)

### Stopping Services

**Development:**
```bash
docker-compose -f docker-compose.dev.yml down
```

**Production:**
```bash
./scripts/prod-stop.sh    # Linux/macOS
scripts\prod-stop.bat     # Windows
```

## Available Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Web Interface | http://localhost:3000 | Use registration to create an account |
| API | http://localhost:3001 | N/A |
| MinIO Console | http://localhost:9001 | noah_minio_user / noah_minio_password |
| Grafana | http://localhost:3001 | admin / noah_grafana_password |
| Jaeger UI | http://localhost:16686 | N/A |

## Stopping the Environment

To stop all services:
```bash
docker-compose -f docker-compose.dev.yml down
```

To stop services and remove volumes (this will delete all data):
```bash
docker-compose -f docker-compose.dev.yml down -v
```

## Development Workflow

1. The source code is mounted as volumes in the containers, so changes to your local files will be reflected in the running services.
2. Both the API and Web app will automatically restart when you make code changes.
3. Database migrations should be run using the `db:migrate` npm script.

## Troubleshooting

### Common Issues

**Services fail to start:**
- Check Docker logs: `docker-compose -f docker-compose.dev.yml logs [service_name]`
- Ensure required ports are available (3000, 3001, 5432, etc.)
- Check if the `.env` files are properly set up

**Database connection issues:**
- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check the DATABASE_URL environment variable in the API .env file

**MinIO bucket setup issues:**
- Manual setup can be done through the MinIO console at http://localhost:9001
- Create a bucket named `noah-assets` and set its access policy to public
