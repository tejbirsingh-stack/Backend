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
    API_PORT: parseInt(process.env.API_PORT || '3000', 10),
    API_HOST: process.env.API_HOST || '0.0.0.0',
    API_CORS_ORIGIN: process.env.API_CORS_ORIGIN || 'http://localhost:3001,http://localhost:19006',
    
    DATABASE_URL: process.env.DATABASE_URL || '',
    
    REDIS_URL: process.env.REDIS_URL || '',
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
    REDIS_SENTINEL_SERVICE_NAME: process.env.REDIS_SENTINEL_SERVICE_NAME || 'noah-master',
    REDIS_SENTINEL_HOST: process.env.REDIS_SENTINEL_HOST || 'localhost',
    REDIS_SENTINEL_PORT: parseInt(process.env.REDIS_SENTINEL_PORT || '26379', 10),
    
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || '',
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10737418240', 10), // 10GB
    MAX_FILES_PER_UPLOAD: parseInt(process.env.MAX_FILES_PER_UPLOAD || '10', 10),
    ALLOWED_MIME_TYPES: process.env.ALLOWED_MIME_TYPES || 'video/mp4,video/quicktime,video/x-msvideo,image/jpeg,image/png,image/webp',
    
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'minio',
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost:9000',
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || '',
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || '',
    MINIO_BUCKET: process.env.MINIO_BUCKET || 'noah-dev-assets',
    MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',
    
    COMPRESSION_SERVICE_URL: process.env.COMPRESSION_SERVICE_URL || 'http://localhost:8080',
    COMPRESSION_QUEUE_NAME: process.env.COMPRESSION_QUEUE_NAME || 'compression-jobs',
    COMPRESSION_WORKER_CONCURRENCY: parseInt(process.env.COMPRESSION_WORKER_CONCURRENCY || '4', 10),
    
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true',
    HELMET_ENABLED: process.env.HELMET_ENABLED !== 'false',
    
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    PROMETHEUS_PORT: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
    JAEGER_ENDPOINT: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    
    KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'noah-platform',
    KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'noah-platform-group'
  };

  // Validate required fields
  const requiredFields = [
    'DATABASE_URL',
    'JWT_SECRET', 
    'REFRESH_TOKEN_SECRET',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY'
  ];

  const missingFields = requiredFields.filter(field => !config[field as keyof Config]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required environment variables: ${missingFields.join(', ')}`);
  }

  return config;
}

export const config = validateConfig();
