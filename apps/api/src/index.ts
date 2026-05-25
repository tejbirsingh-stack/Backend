import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import path from 'path';

// Load environment variables
dotenv.config();

// Mock Redis and Prisma for development
// const Redis = null;
// const PrismaClient = null;

// Mock services
const authService = {
  validateSession: async (token) => {
    return {
      id: 'session_123',
      user: {
        id: 'user_123',
        email: 'dev@example.com',
        name: 'Development User',
        role: 'admin'
      }
    };
  }
};

const mediaService = {};
const compressionService = {};

// Simplified utilities
class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }
  
  info(message, meta) {
    console.log(`[INFO] [${this.namespace}] ${message}`, meta || '');
  }
  
  warn(message, meta) {
    console.warn(`[WARN] [${this.namespace}] ${message}`, meta || '');
  }
  
  error(message, meta) {
    console.error(`[ERROR] [${this.namespace}] ${message}`, meta || '');
  }
}

class MetricsCollector {
  recordHttpRequest() {}
  recordError() {}
  getMetrics() { return "# Metrics placeholder"; }
}

class HealthChecker {
  async check(services: any = {}) {
    // Check services passed as parameters
    const serviceStatus: Record<string, string> = {};
    
    // Add auth service status if provided
    if (services.authService) {
      try {
        const authStatus = await services.authService.healthCheck();
        serviceStatus.auth = authStatus ? 'ok' : 'error';
      } catch (error) {
        serviceStatus.auth = 'error';
      }
    }
    
    // Overall status is healthy if no services are in error state
    const hasErrors = Object.values(serviceStatus).some(status => status === 'error');
    
    return { 
      status: hasErrors ? 'unhealthy' : 'healthy', 
      timestamp: new Date().toISOString(),
      services: serviceStatus,
      version: process.env.VERSION || '1.0.0',
      environment: process.env.NODE_ENV
    };
  }
}

// Configuration
const config = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://noah_user:noah_dev_password@localhost:5432/noah_dev',
  REDIS_SENTINEL_HOST: process.env.REDIS_SENTINEL_HOST || 'localhost',
  REDIS_SENTINEL_PORT: parseInt(process.env.REDIS_SENTINEL_PORT || '26379', 10),
  REDIS_SENTINEL_SERVICE_NAME: process.env.REDIS_SENTINEL_SERVICE_NAME || 'noah-master',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'noah_redis_password',
  API_CORS_ORIGIN: process.env.API_CORS_ORIGIN || 'http://localhost:3001',
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true',
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  MAX_FILES_PER_UPLOAD: parseInt(process.env.MAX_FILES_PER_UPLOAD || '100', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  API_PORT: parseInt(process.env.API_PORT || '4000', 10),
  API_HOST: process.env.API_HOST || 'localhost',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

const logger = new Logger('noah-api');
const metrics = new MetricsCollector();
const healthChecker = new HealthChecker();

// Initialize Fastify with enhanced configuration
const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  },
  bodyLimit: config.MAX_FILE_SIZE,
  trustProxy: true,
  keepAliveTimeout: 30000,
  connectionTimeout: 60000
});

// Initialize database connection
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  datasources: {
    db: {
      url: config.DATABASE_URL
    }
  }
});

// Initialize Redis connection with Sentinel support
// const redis = new Redis({
//   sentinels: [
//     { host: config.REDIS_SENTINEL_HOST, port: config.REDIS_SENTINEL_PORT }
//   ],
//   name: config.REDIS_SENTINEL_SERVICE_NAME,
//   password: config.REDIS_PASSWORD,
//   retryDelayOnFailover: 100,
//   enableOfflineQueue: false,
//   maxRetriesPerRequest: 3,
//   lazyConnect: true
// });
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  lazyConnect: false
});

// Add global context
fastify.decorate('prisma', prisma);
fastify.decorate('redis', redis);
fastify.decorate('logger', logger);
fastify.decorate('metrics', metrics);
fastify.decorate('authService', authService);
fastify.decorate('mediaService', mediaService);
fastify.decorate('compressionService', compressionService);

// Main setup function to avoid top-level await
async function setupServer() {
  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false
  });

  await fastify.register(cors, {
    origin: config.API_CORS_ORIGIN.split(','),
    credentials: config.CORS_CREDENTIALS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    redis: redis,
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for'] || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        code: 429,
        error: 'Rate limit exceeded',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        retryAfter: Math.round(context.ttl / 1000)
      };
    }
  });

  await fastify.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100 * 1024,
      fields: 10,
      fileSize: config.MAX_FILE_SIZE,
      files: config.MAX_FILES_PER_UPLOAD,
      headerPairs: 2000
    }
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
      issuer: 'noah-platform',
      audience: 'noah-users'
    },
    verify: {
      issuer: 'noah-platform',
      audience: 'noah-users'
    }
  });

  await fastify.register(websocket);

  // Serve uploaded media files for preview/playback
  await fastify.register(fastifyStatic, {
    root: path.resolve(__dirname, '../uploads'),
    prefix: '/uploads/',
  });

  // Authentication decorator
  fastify.decorate('authenticate', async function(request: any, reply: any) {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        throw new Error('No authorization token provided');
      }

      const decoded = await request.jwtVerify();
      const session = await fastify.authService.validateSession(token);
      
      if (!session) {
        throw new Error('Invalid or expired session');
      }

      request.user = session.user;
      request.session = session;
    } catch (err: any) {
      reply.code(401).send({ 
        error: 'Unauthorized', 
        message: err.message 
      });
    }
  });

  // Request ID and correlation tracking
  fastify.addHook('onRequest', async (request: any, reply: any) => {
    const requestId = request.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    request.id = requestId;
    reply.header('x-request-id', requestId);
    
    // Start request timer for metrics
    request.startTime = Date.now();
  });

  // Response time and metrics collection
  fastify.addHook('onResponse', async (request: any, reply: any) => {
    const responseTime = Date.now() - request.startTime;
    
    // Collect metrics
    metrics.recordHttpRequest(
      request.method,
      request.url,
      reply.statusCode,
      responseTime
    );
    
    // Log request completion
    logger.info('Request completed', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: request.headers['user-agent']
    });
  });

  // Error handler
  fastify.setErrorHandler(async (error: any, request: any, reply: any) => {
    const requestId = request.id;
    
    logger.error('Request error', {
      requestId,
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method
    });
    
    // Increment error metrics
    metrics.recordError(error.name || 'UnknownError');
    
    // Determine status code
    let statusCode = 500;
    if (error.statusCode) {
      statusCode = error.statusCode;
    } else if (error.code === 'FST_JWT_BAD_REQUEST') {
      statusCode = 401;
    } else if (error.code === 'FST_ERR_VALIDATION') {
      statusCode = 400;
    }
    
    // Send error response
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      requestId,
      timestamp: new Date().toISOString()
    });
  });

  // Health check endpoint
  fastify.get('/health', async (request: any, reply: any) => {
    const health = await healthChecker.check({
      database: prisma,
      redis: redis,
      authService: fastify.authService
    });
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    reply.code(statusCode).send(health);
  });

  // Metrics endpoint for Prometheus
  fastify.get('/metrics', async (request: any, reply: any) => {
    const metrics = await fastify.metrics.getMetrics();
    reply.type('text/plain').send(metrics);
  });

  try {
    // API Routes - using plain require to avoid top-level await
    // These are placeholder routes for development - create empty files to test
    fastify.register(require('./routes/auth-routes'), { prefix: '/api/auth' });
    fastify.register(require('./routes/media'), { prefix: '/api/media' });
    fastify.register(require('./routes/collections'), { prefix: '/api/collections' });
    fastify.register(require('./routes/compression'), { prefix: '/api/compression' });
    fastify.register(require('./routes/organizations'), { prefix: '/api/organizations' });
    fastify.register(require('./routes/users'), { prefix: '/api/users' });
    fastify.register(require('./routes/analytics'), { prefix: '/api/analytics' });
    
    // WebSocket routes for real-time features
    fastify.register(require('./routes/realtime'), { prefix: '/ws' });
  } catch (err: any) {
    logger.warn('Some routes could not be loaded', { error: err.message });
  }

  // Start server
  try {
    await fastify.listen({ 
      port: config.API_PORT, 
      host: config.API_HOST 
    });
    
    logger.info(`Noah API Server started successfully`, {
      port: config.API_PORT,
      host: config.API_HOST,
      environment: config.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (err: any) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop accepting new connections
    await fastify.close();
    
    // Close database connections
    await prisma.$disconnect();
    
    // Close Redis connection
    await redis.disconnect();
    
    logger.info('Shutdown completed successfully');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Call the setup function
setupServer();
