import 'dotenv/config';
import './worker.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import path from 'path';
import { logSuccess, logError, ACTOR_TYPE, ACTIVITY_NAME } from './lib/audit-log.js';

// Add global BigInt serializer to prevent fastify/JSON stringify errors
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Mock Redis and Prisma for development
// const Redis = null;
// const PrismaClient = null;

// Use real auth service instead of mock
// @ts-ignore
import authService from './services/auth-service.js';

import emailService from './services/email-service.js';
import { Logger } from './utils/logger.js';
import { MetricsCollector } from './utils/metrics.js';
//import { HealthChecker } from './utils/health.js';

const mediaService = {};
const compressionService = {};

// Utilities imported from ./utils

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: any;
    logger: Logger;
    metrics: MetricsCollector;
    authService: any;
    mediaService: any;
    compressionService: any;
    authenticate: any;
    emailService: any;
  }
}



import { config } from './config/index.js';

const logger = new Logger('noah-api');
const metrics = new MetricsCollector();
//const healthChecker = new HealthChecker();

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
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  datasources: {
    db: {
      url: config.DATABASE_URL
    }
  }
});
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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
fastify.decorate('emailService', emailService);

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
        mediaSrc: ["'self'", "https:", "blob:"],
        frameSrc: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-File-Size', 'X-Request-Id']
  });

  // await fastify.register(rateLimit as any, {
  //   max: config.RATE_LIMIT_MAX_REQUESTS,
  //   timeWindow: config.RATE_LIMIT_WINDOW_MS,
  //   redis: redis,
  //   keyGenerator: (request: any) => {
  //     const xForwardedFor = request.headers['x-forwarded-for'];
  //     return (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor) || request.ip;
  //   },
  //   errorResponseBuilder: (request: any, context: any) => {
  //     return {
  //       code: 429,
  //       error: 'Rate limit exceeded',
  //       message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
  //       retryAfter: Math.round(context.ttl / 1000)
  //     };
  //   }
  // });

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

  await fastify.register(jwt as any, {
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
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        throw new Error('No authorization token provided');
      }

      try {
        const decoded = await request.jwtVerify();
        request.user = decoded;
        return;
      } catch (jwtErr) {
        const session = await fastify.authService.validateSession(token);
        if (!session) {
          throw new Error('Invalid or expired session');
        }
        request.user = session.user;
        request.session = session;
      }
    } catch (err: any) {
      err.statusCode = 401;
      throw err;
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
      message: error.message || 'An unexpected error occurred',
      requestId,
      timestamp: new Date().toISOString()
    });
  });

  // Metrics endpoint for Prometheus
  fastify.get('/metrics', async (request: any, reply: any) => {
    const metrics = await fastify.metrics.getMetrics();
    reply.type('text/plain').send(metrics);
  });

  fastify.get('/api/server', async (request, reply) => {
    reply.code(200).send({
      message: 'Server is running',
      timestamp: new Date().toISOString()
    });
  });

  try {
    // API Routes - using plain require to avoid top-level await
    fastify.register(require('./routes/analytics'), { prefix: '/api/analytics' });
    fastify.register(require('./routes/annotations'), { prefix: '/api/annotations' });
    fastify.register(require('./routes/workspaces'), { prefix: '/api/workspaces' });
    fastify.register(require('./routes/auth-routes'), { prefix: '/api/auth' });
    fastify.register(require('./routes/collections'), { prefix: '/api/collections' });
    fastify.register(require('./routes/favorites'), { prefix: '/api/favorites' });
    fastify.register(require('./routes/compression'), { prefix: '/api/compression' });
    fastify.register(require('./routes/health-route.js'));
    fastify.register(require('./routes/media'), { prefix: '/api/media' });
    fastify.register(require('./routes/organizations'), { prefix: '/api/organizations' });
    fastify.register(require('./routes/realtime'), { prefix: '/api/ws' });    // WebSocket routes for real-time video features
    fastify.register(require('./routes/rooms'), { prefix: '/api/rooms' });
    fastify.register(require('./routes/users'), { prefix: '/api/users' });
    fastify.register(require('./routes/cron'), { prefix: '/api/cron' });
    fastify.register(require('./routes/notifications'), { prefix: '/api/notifications' });
    fastify.register(require('./routes/share-routes'), { prefix: '/api' });
    fastify.register(require('./routes/tags'), { prefix: '/api/tags' });

    console.log('All routes registerd successfully')
    logSuccess("All routes registered successfully", '', null, null, ACTOR_TYPE.SYSTEM);
  } catch (err: any) {
    logError("All routes registered failed", '', null, err, null, ACTOR_TYPE.SYSTEM);
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
