# 🔌 Noah Platform - Port Configuration Guide

## Standard Port Allocation

The Noah Platform uses a standardized port allocation strategy to avoid conflicts:

### Port Ranges

| Service Category | Port Range | Description |
|-----------------|------------|-------------|
| **Web Applications** | 3000-3999 | Frontend applications, admin panels, demos |
| **API Services** | 4000-4999 | REST APIs, GraphQL endpoints, microservices |
| **Database Services** | 5000-5999 | PostgreSQL, MySQL, MongoDB, etc. |
| **Cache/Queue** | 6000-6999 | Redis, RabbitMQ, Kafka, etc. |
| **Development Tools** | 7000-7999 | Webpack dev server, HMR, debugging |
| **Monitoring** | 8000-8999 | Grafana, Prometheus, metrics |
| **Storage Services** | 9000-9999 | MinIO, S3 proxies, file servers |

## Current Service Ports

### Core Services

| Service | Port | Environment Variable | Description |
|---------|------|---------------------|-------------|
| Web App | 3000 | `PORT` | Main React application |
| API Server | 4000 | `PORT` or `API_PORT` | Main Fastify API |
| PostgreSQL | 5432 | `DATABASE_PORT` | Primary database |
| Redis | 6379 | `REDIS_PORT` | Cache and sessions |
| MinIO | 9000 | `MINIO_PORT` | S3-compatible storage |
| MinIO Console | 9001 | `MINIO_CONSOLE_PORT` | Storage admin UI |

### Additional Services (When Enabled)

| Service | Port | Description |
|---------|------|-------------|
| Web App (Dev) | 3001 | Alternative dev instance |
| API (Test) | 4001 | Test API server |
| Compression API | 4002 | Rust compression service |
| AI Service | 4003 | AI/ML processing |
| Billing API | 4004 | Stripe integration |
| Storage API | 4005 | B2/S3 storage service |
| Kafka | 9092 | Event streaming |
| Zookeeper | 2181 | Kafka coordination |
| pgBouncer | 5433 | Database connection pooling |
| Redis Sentinel | 26379 | Redis HA |

## Configuration Files

### API Configuration (`apps/api/.env`)
```env
# Server
PORT=4000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/noah

# Redis
REDIS_URL=redis://localhost:6379

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### Web App Configuration (`apps/web/.env`)
```env
# API Connection
VITE_API_URL=http://localhost:4000/api

# Development Server
PORT=3000
HOST=localhost
```

## Starting Services with Custom Ports

### API Server
```bash
# Default port (4000)
cd apps/api
npm run dev:simple

# Custom port
PORT=4001 npm run dev:simple

# Windows
set PORT=4001 && npm run dev:simple
```

### Web Application
```bash
# Default port (3000)
cd apps/web
npm run dev

# Custom port
PORT=3001 npm run dev

# Windows
set PORT=3001 && npm run dev
```

## Port Conflict Resolution

### Check Port Usage

#### Windows
```batch
REM Check specific port
netstat -an | findstr :4000

REM Find process using port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do echo PID: %%a

REM Kill process on port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /F /PID %%a
```

#### Linux/macOS
```bash
# Check specific port
lsof -i :4000

# Kill process on port
kill -9 $(lsof -t -i:4000)
```

## Development Workflow

### Standard Development Setup
```bash
# Terminal 1 - API (Port 4000)
cd apps/api
PORT=4000 npm run dev:simple

# Terminal 2 - Web App (Port 3000)
cd apps/web
npm run dev
```

### Multi-Instance Setup
```bash
# API Instances
PORT=4000 npm run dev:simple  # Main API
PORT=4001 npm run dev:simple  # Test API
PORT=4002 npm run dev:simple  # Debug API

# Web Instances
PORT=3000 npm run dev  # Main App
PORT=3001 npm run dev  # Admin Panel
PORT=3002 npm run dev  # Demo Site
```

## Docker Compose Ports

### Development (`docker-compose.dev.yml`)
```yaml
services:
  api:
    ports:
      - "4000:4000"
  
  web:
    ports:
      - "3000:3000"
  
  postgres:
    ports:
      - "5432:5432"
  
  redis:
    ports:
      - "6379:6379"
  
  minio:
    ports:
      - "9000:9000"
      - "9001:9001"
```

### Production (`docker-compose.production.yml`)
```yaml
services:
  api:
    ports:
      - "4000:4000"  # Or use reverse proxy
  
  web:
    ports:
      - "80:80"      # Nginx serves on 80
      - "443:443"    # HTTPS
```

## Testing Ports

The test suite expects these ports:
- API: `4000`
- Web: `3000`

Update test configuration if using different ports:
```javascript
// test-suite.html or quick-test.js
const API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:3000';
```

## Troubleshooting

### Common Issues

1. **"Port already in use" error**
   - Check what's using the port
   - Kill the process or use a different port
   - Update environment variables

2. **Frontend can't connect to API**
   - Verify API is running on expected port
   - Check `VITE_API_URL` in web app `.env`
   - Ensure CORS is configured correctly

3. **Services can't find each other in Docker**
   - Use service names, not localhost
   - Example: `http://api:4000` not `http://localhost:4000`

### Port Verification Script
```javascript
// verify-ports.js
const ports = {
  api: 4000,
  web: 3000,
  postgres: 5432,
  redis: 6379,
  minio: 9000
};

for (const [service, port] of Object.entries(ports)) {
  fetch(`http://localhost:${port}`)
    .then(() => console.log(`✅ ${service} on port ${port}`))
    .catch(() => console.log(`❌ ${service} not responding on ${port}`));
}
```

## Best Practices

1. **Always use environment variables** for port configuration
2. **Document non-standard ports** in your `.env.example`
3. **Avoid hardcoding ports** in application code
4. **Use the allocated ranges** to prevent conflicts
5. **Test with default ports** before customizing
6. **Update all references** when changing ports:
   - Environment files
   - Docker compose files
   - Documentation
   - Test suites
   - Startup scripts

## Quick Reference

```bash
# Start everything with standard ports
./start-noah.bat  # Windows
./start-noah.sh   # Linux/macOS

# Standard URLs
Web App:  http://localhost:3000
API:      http://localhost:4000
API Docs: http://localhost:4000/docs
Health:   http://localhost:4000/health
```