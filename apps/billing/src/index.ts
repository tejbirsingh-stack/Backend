import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
<<<<<<< HEAD
import dotenv from 'dotenv';
=======
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
import { createLogger } from './utils/logger.js';
import { subscriptionRoutes } from './routes/subscriptions.js';
import { billingRoutes } from './routes/billing.js';
import { webhookRoutes } from './routes/webhooks.js';
import { usageRoutes } from './routes/usage.js';
import { analyticsRoutes } from './routes/analytics.js';

<<<<<<< HEAD
dotenv.config({ path: '../../.env' });

=======
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
const logger = createLogger('billing-service');
const prisma = new PrismaClient();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }
});

// Register plugins
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.stripe.com"],
    },
  },
});

await fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
  credentials: true,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'your-secret-key',
});

// Add Stripe and Prisma to request context
fastify.decorate('stripe', stripe);
fastify.decorate('prisma', prisma);

// Health check
fastify.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'noah-billing',
      version: '1.0.0'
    };
  } catch (error) {
    reply.code(503);
    return { 
      status: 'unhealthy', 
      error: 'Database connection failed' 
    };
  }
});

// Authentication middleware
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health check and webhooks
  if (request.url === '/health' || request.url.startsWith('/webhooks')) {
    return;
  }

  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// Register routes
await fastify.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
await fastify.register(billingRoutes, { prefix: '/api/billing' });
await fastify.register(webhookRoutes, { prefix: '/webhooks' });
await fastify.register(usageRoutes, { prefix: '/api/usage' });
await fastify.register(analyticsRoutes, { prefix: '/api/analytics' });

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  logger.error('Request error:', error);
  
  if (error.validation) {
    reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation
    });
    return;
  }

  if (error.statusCode) {
    reply.status(error.statusCode).send({
      error: error.name,
      message: error.message
    });
    return;
  }

  reply.status(500).send({
    error: 'Internal Server Error',
    message: 'Something went wrong'
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down billing service...');
  
  try {
    await fastify.close();
    await prisma.$disconnect();
    logger.info('Billing service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
  try {
<<<<<<< HEAD
    const port = parseInt(process.env.PORT || '3003');
=======
    const port = parseInt(process.env.PORT || '3002');
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    logger.info(`Noah Billing Service running on http://${host}:${port}`);
    
  } catch (err) {
    logger.error('Error starting billing service:', err);
    process.exit(1);
  }
};

start();
