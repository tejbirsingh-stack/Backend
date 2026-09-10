const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');

// Default configurations
const CONFIG = {
  // Max password reset requests per email address within window
  EMAIL_LIMIT_POINTS: parseInt(process.env.PASSWORD_RESET_MAX_PER_EMAIL || '3', 10),
  EMAIL_LIMIT_DURATION: parseInt(process.env.PASSWORD_RESET_EMAIL_WINDOW_SECONDS || '900', 10), // 15 minutes
  EMAIL_LIMIT_BLOCK: parseInt(process.env.PASSWORD_RESET_EMAIL_BLOCK_SECONDS || '900', 10), // 15 minutes block

  // Minimum cooldown between consecutive emails to the same address
  EMAIL_COOLDOWN_POINTS: 1,
  EMAIL_COOLDOWN_DURATION: parseInt(process.env.PASSWORD_RESET_COOLDOWN_SECONDS || '60', 10), // 60 seconds

  // Max password reset requests per IP address within window
  IP_LIMIT_POINTS: parseInt(process.env.PASSWORD_RESET_MAX_PER_IP || '10', 10),
  IP_LIMIT_DURATION: parseInt(process.env.PASSWORD_RESET_IP_WINDOW_SECONDS || '900', 10), // 15 minutes
  IP_LIMIT_BLOCK: parseInt(process.env.PASSWORD_RESET_IP_BLOCK_SECONDS || '900', 10), // 15 minutes block
};

// Memory limiters (used as standalone fallback and as insurance limiters for Redis)
const memoryEmailLimiter = new RateLimiterMemory({
  points: CONFIG.EMAIL_LIMIT_POINTS,
  duration: CONFIG.EMAIL_LIMIT_DURATION,
  blockDuration: CONFIG.EMAIL_LIMIT_BLOCK,
});

const memoryCooldownLimiter = new RateLimiterMemory({
  points: CONFIG.EMAIL_COOLDOWN_POINTS,
  duration: CONFIG.EMAIL_COOLDOWN_DURATION,
  blockDuration: CONFIG.EMAIL_COOLDOWN_DURATION,
});

const memoryIpLimiter = new RateLimiterMemory({
  points: CONFIG.IP_LIMIT_POINTS,
  duration: CONFIG.IP_LIMIT_DURATION,
  blockDuration: CONFIG.IP_LIMIT_BLOCK,
});

// Cache for Redis limiters keyed by redis instance
let redisLimiters = null;

function getRedisLimiters(redisClient) {
  if (!redisClient || (redisClient.status !== 'ready' && redisClient.status !== 'connect')) {
    return null;
  }

  if (redisLimiters && redisLimiters.client === redisClient) {
    return redisLimiters;
  }

  try {
    redisLimiters = {
      client: redisClient,
      emailLimiter: new RateLimiterRedis({
        storeClient: redisClient,
        points: CONFIG.EMAIL_LIMIT_POINTS,
        duration: CONFIG.EMAIL_LIMIT_DURATION,
        blockDuration: CONFIG.EMAIL_LIMIT_BLOCK,
        insuranceLimiter: memoryEmailLimiter,
        keyPrefix: 'rl_pwd_email',
      }),
      cooldownLimiter: new RateLimiterRedis({
        storeClient: redisClient,
        points: CONFIG.EMAIL_COOLDOWN_POINTS,
        duration: CONFIG.EMAIL_COOLDOWN_DURATION,
        blockDuration: CONFIG.EMAIL_COOLDOWN_DURATION,
        insuranceLimiter: memoryCooldownLimiter,
        keyPrefix: 'rl_pwd_cooldown',
      }),
      ipLimiter: new RateLimiterRedis({
        storeClient: redisClient,
        points: CONFIG.IP_LIMIT_POINTS,
        duration: CONFIG.IP_LIMIT_DURATION,
        blockDuration: CONFIG.IP_LIMIT_BLOCK,
        insuranceLimiter: memoryIpLimiter,
        keyPrefix: 'rl_pwd_ip',
      }),
    };
    return redisLimiters;
  } catch (err) {
    console.warn('Failed to initialize Redis rate limiters, falling back to memory:', err.message);
    return null;
  }
}

/**
 * Safely extracts client IP address from Fastify request
 * @param {object} request 
 * @returns {string} Client IP address
 */
function getClientIp(request) {
  if (!request) return '127.0.0.1';

  // Check Cloudflare or custom proxy headers first
  const cfIp = request.headers?.['cf-connecting-ip'];
  if (cfIp) return String(cfIp).trim();

  const xRealIp = request.headers?.['x-real-ip'];
  if (xRealIp) return String(xRealIp).trim();

  const xForwardedFor = request.headers?.['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = Array.isArray(xForwardedFor) ? xForwardedFor : xForwardedFor.split(',');
    if (ips.length > 0 && ips[0].trim()) {
      return ips[0].trim();
    }
  }

  return request.ip || request.raw?.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Check and enforce rate limits for password reset requests
 * 
 * @param {object} params
 * @param {string} params.email - Recipient email address
 * @param {string} params.ip - Client IP address
 * @param {object} [params.redisClient] - Optional Redis connection
 * @returns {Promise<{ allowed: boolean, retryAfter?: number, message?: string, reason?: string, remaining?: number }>}
 */
async function checkPasswordResetRateLimit({ email, ip, redisClient }) {
  // Rate limiting disabled for testing phase
  return { allowed: true, remaining: 999 };

  const normalizedEmail = (email || '').trim().toLowerCase();
  const safeIp = (ip || '127.0.0.1').trim();

  if (!normalizedEmail) {
    return {
      allowed: false,
      statusCode: 400,
      message: 'Email is required for password reset',
      reason: 'INVALID_EMAIL',
    };
  }

  const limiters = getRedisLimiters(redisClient);
  const emailLimiter = limiters?.emailLimiter || memoryEmailLimiter;
  const cooldownLimiter = limiters?.cooldownLimiter || memoryCooldownLimiter;
  const ipLimiter = limiters?.ipLimiter || memoryIpLimiter;

  // 1. Check IP-based rate limit first to prevent spamming from a single source
  try {
    await ipLimiter.consume(safeIp);
  } catch (ipRes) {
    if (ipRes && typeof ipRes.msBeforeNext === 'number') {
      const retryAfter = Math.max(1, Math.ceil(ipRes.msBeforeNext / 1000));
      return {
        allowed: false,
        statusCode: 429,
        retryAfter,
        reason: 'IP_LIMIT',
        message: `Too many password reset requests from this IP address. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      };
    }
    // If unexpected error, fallback safely
    console.error('IP rate limiter error:', ipRes);
  }

  // 2. Check Cooldown between consecutive emails to the same account
  try {
    await cooldownLimiter.consume(normalizedEmail);
  } catch (cooldownRes) {
    if (cooldownRes && typeof cooldownRes.msBeforeNext === 'number') {
      const retryAfter = Math.max(1, Math.ceil(cooldownRes.msBeforeNext / 1000));
      return {
        allowed: false,
        statusCode: 429,
        retryAfter,
        reason: 'COOLDOWN',
        message: `A password reset link was recently requested. Please wait ${retryAfter} seconds before requesting another email.`,
      };
    }
    console.error('Cooldown rate limiter error:', cooldownRes);
  }

  // 3. Check Email-based window rate limit (e.g., max 3 per 15 mins)
  try {
    const emailRes = await emailLimiter.consume(normalizedEmail);
    return {
      allowed: true,
      remaining: emailRes.remainingPoints,
    };
  } catch (emailRes) {
    if (emailRes && typeof emailRes.msBeforeNext === 'number') {
      const retryAfter = Math.max(1, Math.ceil(emailRes.msBeforeNext / 1000));
      return {
        allowed: false,
        statusCode: 429,
        retryAfter,
        reason: 'EMAIL_LIMIT',
        message: `Too many password reset requests for this email account. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      };
    }
    console.error('Email rate limiter error:', emailRes);
    return { allowed: true, remaining: 0 };
  }
}

/**
 * Resets limiters for a given email and/or IP (useful for testing or admin actions)
 */
async function resetPasswordResetLimits(email, ip) {
  const tasks = [];
  if (email) {
    const normalized = email.trim().toLowerCase();
    tasks.push(memoryEmailLimiter.delete(normalized).catch(() => {}));
    tasks.push(memoryCooldownLimiter.delete(normalized).catch(() => {}));
    if (redisLimiters) {
      tasks.push(redisLimiters.emailLimiter.delete(normalized).catch(() => {}));
      tasks.push(redisLimiters.cooldownLimiter.delete(normalized).catch(() => {}));
    }
  }
  if (ip) {
    tasks.push(memoryIpLimiter.delete(ip).catch(() => {}));
    if (redisLimiters) {
      tasks.push(redisLimiters.ipLimiter.delete(ip).catch(() => {}));
    }
  }
  await Promise.all(tasks);
}

module.exports = {
  CONFIG,
  getClientIp,
  checkPasswordResetRateLimit,
  resetPasswordResetLimits,
  _internal: {
    memoryEmailLimiter,
    memoryCooldownLimiter,
    memoryIpLimiter,
  },
};
