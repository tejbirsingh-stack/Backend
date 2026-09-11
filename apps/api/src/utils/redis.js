/**
 * redis.js
 * Centralized Redis client factory supporting REDIS_URL (UAT/Production/ElastiCache)
 * and individual host/port environment variables.
 */

const Redis = require('ioredis');

function createRedisClient(extraOpts = {}) {
  const redisUrl = process.env.REDIS_URL;
  const redisTls = process.env.REDIS_TLS === 'true';

  const defaultOpts = {
    connectTimeout: 10000,
    tls: redisTls ? {} : undefined,
    ...extraOpts
  };

  if (redisUrl) {
    return new Redis(redisUrl, defaultOpts);
  }

  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    ...defaultOpts
  });
}

module.exports = {
  createRedisClient
};
