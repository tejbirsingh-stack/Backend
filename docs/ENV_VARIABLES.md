# Noah Platform Environment Variables Guide

This document provides guidance on setting up all environment variables required for the Noah platform.

## Setting Up Your Environment

1. Copy the `.env.example` file to `.env` in the project root:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file to set values for each environment variable

3. For development with Docker, these values will be picked up automatically
   
4. For production deployment, set these variables in your deployment environment

## Authentication Variables

### Essential Authentication Variables

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `ACCESS_TOKEN_SECRET` | Secret for signing access tokens | Generate using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `REFRESH_TOKEN_SECRET` | Secret for refresh tokens | Generate using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ACCESS_TOKEN_EXPIRY` | Lifespan of access tokens | Set to `15m` for 15 minutes (recommended) |
| `REFRESH_TOKEN_EXPIRY` | Lifespan of refresh tokens | Set to `7d` for 7 days (recommended) |
| `MFA_ISSUER` | Name shown in authenticator apps | Set to your application name, e.g. `"Noah Media Platform"` |
| `AUTH_RATE_LIMIT_POINTS` | Login attempts before rate limiting | Set to `5` (recommended) |
| `AUTH_RATE_LIMIT_DURATION` | Rate limit window in seconds | Set to `900` for 15 minutes (recommended) |

### Legacy Authentication Variables (Kept for Compatibility)

| Variable | Description | Notes |
|----------|-------------|-------|
| `JWT_SECRET` | Legacy JWT signing secret | Generate as with ACCESS_TOKEN_SECRET |
| `JWT_EXPIRES_IN` | Legacy token expiry | Set to `7d` or as needed |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data | 32-character random string |
| `BCRYPT_ROUNDS` | Rounds for bcrypt hashing | `12` is recommended for good security/performance balance |

## Database Configuration

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `DATABASE_URL` | PostgreSQL connection URL | Format: `postgresql://username:password@hostname:port/database` |
| `POSTGRES_USER` | PostgreSQL username | Create during database setup |
| `POSTGRES_PASSWORD` | PostgreSQL password | Generate a strong password |
| `POSTGRES_DB` | Database name | Set to your preferred name, e.g. `noah_dev` |

## Redis Configuration

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `REDIS_URL` | Redis connection URL | Format: `redis://:password@hostname:port` |
| `REDIS_PASSWORD` | Redis password | Generate a strong password |
| `REDIS_SENTINEL_SERVICE_NAME` | Sentinel service name | Set if using Redis Sentinel, e.g. `noah-master` |
| `REDIS_SENTINEL_HOST` | Sentinel hostname | Set if using Redis Sentinel |
| `REDIS_SENTINEL_PORT` | Sentinel port | Set if using Redis Sentinel, typically `26379` |

## Storage Configuration

### Development (MinIO)

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `STORAGE_PROVIDER` | Storage provider to use | Set to `minio` for development |
| `MINIO_ENDPOINT` | MinIO server address | Typically `localhost:9000` for local development |
| `MINIO_ACCESS_KEY` | MinIO access key | Set during MinIO setup |
| `MINIO_SECRET_KEY` | MinIO secret key | Set during MinIO setup |
| `MINIO_BUCKET` | MinIO bucket name | Create in MinIO console, e.g. `noah-dev-assets` |
| `MINIO_USE_SSL` | Whether to use SSL | Set to `false` for local development |

### Production (B2)

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `B2_APPLICATION_KEY_ID` | Backblaze B2 key ID | Create in B2 web console |
| `B2_APPLICATION_KEY` | Backblaze B2 application key | Create in B2 web console |
| `B2_BUCKET_NAME` | B2 bucket name | Create in B2 web console |
| `B2_BUCKET_ID` | B2 bucket ID | Found in B2 web console |

## Email Configuration

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `SMTP_HOST` | SMTP server hostname | From your email provider |
| `SMTP_PORT` | SMTP server port | Typically `587` for TLS, `25` for non-TLS, `1025` for dev |
| `SMTP_USER` | SMTP username | From your email provider |
| `SMTP_PASSWORD` | SMTP password | From your email provider |
| `SMTP_FROM_EMAIL` | From address | Set to a valid email, e.g. `noreply@yourdomain.com` |
| `SMTP_FROM_NAME` | From name | Set to your application name |

## API Configuration

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `API_PORT` | Port for the API server | `3000` |
| `API_HOST` | Host binding for the API | `0.0.0.0` to accept all connections |
| `API_CORS_ORIGIN` | Allowed CORS origins | Comma-separated list, e.g. `http://localhost:3001,http://localhost:19006` |
| `NODE_ENV` | Node environment | `development`, `test`, or `production` |

## Security

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `RATE_LIMIT_WINDOW_MS` | Rate limiting window | `900000` (15 minutes in milliseconds) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `CORS_CREDENTIALS` | Allow credentials in CORS | `true` |
| `HELMET_ENABLED` | Enable Helmet security | `true` |

## Services

### Compression Service

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `COMPRESSION_SERVICE_URL` | URL of compression service | Set to the service address, e.g. `http://localhost:8080` |
| `COMPRESSION_QUEUE_NAME` | Queue name for jobs | Set to your preferred name, e.g. `compression-jobs` |
| `COMPRESSION_WORKER_CONCURRENCY` | Worker concurrency | Set based on available CPU cores, e.g. `4` |

### AI Service

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `AI_SERVICE_URL` | URL of AI service | Set to the service address, e.g. `http://localhost:5000` |
| `OPENAI_API_KEY` | OpenAI API key | Generate from [OpenAI dashboard](https://platform.openai.com/api-keys) |
| `REPLICATE_API_TOKEN` | Replicate API token | Generate from [Replicate dashboard](https://replicate.com/account/api-tokens) |

## Monitoring

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `PROMETHEUS_PORT` | Port for Prometheus | `9090` |
| `GRAFANA_PORT` | Port for Grafana | `3001` |
| `JAEGER_ENDPOINT` | Jaeger endpoint | `http://localhost:14268/api/traces` |

## Kafka Configuration

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `KAFKA_BROKERS` | Kafka broker addresses | Set to your Kafka address, e.g. `localhost:9092` |
| `KAFKA_CLIENT_ID` | Client ID for Kafka | Set to your application name |
| `KAFKA_GROUP_ID` | Consumer group ID | Set to your preferred name |

## File Upload Limits

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `MAX_FILE_SIZE` | Maximum file size in bytes | `10737418240` (10GB) |
| `MAX_FILES_PER_UPLOAD` | Max files per upload | `10` |
| `ALLOWED_MIME_TYPES` | Allowed file types | Comma-separated list of MIME types |

## Development Settings

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `DEBUG` | Debug namespaces | `noah:*` to see all Noah debug logs |
| `LOG_LEVEL` | Logging level | `debug` for development, `info` for production |
| `PRISMA_LOG_LEVEL` | Prisma logging level | `info` |

## Health Check

| Variable | Description | Recommended Value |
|----------|-------------|------------------|
| `HEALTH_CHECK_TIMEOUT` | Health check timeout in ms | `30000` (30 seconds) |
| `HEALTH_CHECK_INTERVAL` | Interval between checks in ms | `60000` (1 minute) |
