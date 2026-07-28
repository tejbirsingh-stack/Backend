import dotenv from 'dotenv';
dotenv.config();

interface Config {
  // Server
  NODE_ENV: string;
  API_PORT: number;
  API_HOST: string;
  API_CORS_ORIGIN: string;

  // Database
  DATABASE_URL: string;

  // Redis
  REDIS_URL: string;
  REDIS_PASSWORD: string;
  REDIS_SENTINEL_SERVICE_NAME: string;
  REDIS_SENTINEL_HOST: string;
  REDIS_SENTINEL_PORT: number;

  // JWT & Auth
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_SECRET: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  BCRYPT_ROUNDS: number;

  // File Upload
  MAX_FILE_SIZE: number;
  MAX_FILES_PER_UPLOAD: number;
  ALLOWED_MIME_TYPES: string;

  // Storage
  STORAGE_PROVIDER: string;
  MINIO_ENDPOINT: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET: string;
  MINIO_USE_SSL: boolean;

  // Compression
  COMPRESSION_SERVICE_URL: string;
  COMPRESSION_QUEUE_NAME: string;
  COMPRESSION_WORKER_CONCURRENCY: number;

  // Security
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  CORS_CREDENTIALS: boolean;
  HELMET_ENABLED: boolean;

  // Monitoring
  LOG_LEVEL: string;
  PROMETHEUS_PORT: number;
  JAEGER_ENDPOINT: string;

  // Kafka
  KAFKA_BROKERS: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_GROUP_ID: string;
}

function validateConfig(): Config {
  const config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    API_PORT: parseInt(process.env.API_PORT || '4000', 10),
    API_HOST: process.env.API_HOST || '0.0.0.0',
    API_CORS_ORIGIN: process.env.API_CORS_ORIGIN || 'http://localhost:3001,http://localhost:19006,http://localhost:5173',

    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://noah_user:noah_dev_password@localhost:5432/noah_dev',

    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'noah_redis_password',
    REDIS_SENTINEL_SERVICE_NAME: process.env.REDIS_SENTINEL_SERVICE_NAME || 'noah-master',
    REDIS_SENTINEL_HOST: process.env.REDIS_SENTINEL_HOST || 'localhost',
    REDIS_SENTINEL_PORT: parseInt(process.env.REDIS_SENTINEL_PORT || '26379', 10),

    JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || 'your-refresh-secret-key',
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10737418240', 10), // 10GB
    MAX_FILES_PER_UPLOAD: parseInt(process.env.MAX_FILES_PER_UPLOAD || '100', 10),
    ALLOWED_MIME_TYPES: process.env.ALLOWED_MIME_TYPES || 'video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska,video/x-m4v,video/mpeg,video/mp2t,video/ogg,application/mxf,video/mxf,image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/avif,image/bmp,image/vnd.adobe.photoshop,application/postscript,image/x-eps,image/x-exr,image/tiff,image/x-dpx,image/x-cineon,image/x-pcx,image/mpo,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/flac,audio/aiff,audio/3gpp2,audio/x-ape,audio/basic',

    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'minio',
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || process.env.S3_ENDPOINT || 'localhost:9000',
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || process.env.S3_ACCESS_KEY || 'noah_minio_user',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || process.env.S3_SECRET_KEY || 'noah_minio_password',
    MINIO_BUCKET: process.env.MINIO_BUCKET || process.env.S3_BUCKET || 'noah-dev-assets',
    MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',

    COMPRESSION_SERVICE_URL: process.env.COMPRESSION_SERVICE_URL || 'http://localhost:8080',
    COMPRESSION_QUEUE_NAME: process.env.COMPRESSION_QUEUE_NAME || 'compression-jobs',
    COMPRESSION_WORKER_CONCURRENCY: parseInt(process.env.COMPRESSION_WORKER_CONCURRENCY || '4', 10),

    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true',
    HELMET_ENABLED: process.env.HELMET_ENABLED !== 'false',

    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    PROMETHEUS_PORT: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
    JAEGER_ENDPOINT: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',

    KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'noah-platform',
    KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'noah-platform-group'
  };

  return config;
}

export const config = validateConfig();
