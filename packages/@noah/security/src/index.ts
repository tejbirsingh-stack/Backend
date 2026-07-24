// packages/@noah/security/src/index.ts
import * as crypto from 'crypto';
import { promisify } from 'util';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

const scrypt = promisify(crypto.scrypt);

// Content Security Policy configuration
export const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.datadog-rum.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    connectSrc: [
      "'self'",
      'https://api.noah.io', // Placeholder, replace with your actual domain
      'wss://api.noah.io',    // Placeholder, replace with your actual domain
      'https://*.backblazeb2.com',
      'https://logs.datadoghq.com'
    ],
    mediaSrc: ["'self'", 'https:', 'blob:'],
    objectSrc: ["'none'"],
    childSrc: ["'self'", 'blob:'],
    workerSrc: ["'self'", 'blob:'],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [],
    blockAllMixedContent: []
  },
  reportOnly: false
};

// Security headers middleware
export const securityHeaders = () => {
  return helmet({
    contentSecurityPolicy: cspConfig,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
  });
};

// Rate limiting configurations
export const rateLimiters = {
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: req.rateLimit.resetTime
      });
    }
  }),

  auth: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'Too many authentication attempts'
  }),

  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: 'Upload limit exceeded'
  }),

  api: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    keyGenerator: (req) => {
      // req.user will come from JWT validation in the API gateway/auth service
      return (req as any).user?.id || req.ip;
    }
  })
};

// Encryption utilities
export class Encryption {
  private static algorithm = 'aes-256-gcm';
  private static keyLength = 32;
  private static ivLength = 16;
  private static saltLength = 64;
  private static tagLength = 16;

  static async encrypt(text: string, masterKey: string): Promise<string> {
    const salt = crypto.randomBytes(this.saltLength);
    const key = await scrypt(masterKey, salt, this.keyLength) as Buffer;
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    const tag = (cipher as any).getAuthTag();

    return Buffer.concat([
      salt,
      iv,
      tag,
      encrypted
    ]).toString('base64');
  }

  static async decrypt(encryptedData: string, masterKey: string): Promise<string> {
    const data = Buffer.from(encryptedData, 'base64');
    const salt = data.slice(0, this.saltLength);
    const iv = data.slice(this.saltLength, this.saltLength + this.ivLength);
    const tag = data.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
    const encrypted = data.slice(this.saltLength + this.ivLength + this.tagLength);
    const key = await scrypt(masterKey, salt, this.keyLength) as Buffer;

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    (decipher as any).setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  }

  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64) as Buffer;
    return `${salt}:${hash.toString('hex')}`;
  }

  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    const [salt, hash] = hashedPassword.split(':');
    const hashBuffer = Buffer.from(hash, 'hex');
    const derivedKey = await scrypt(password, salt, 64) as Buffer;
    return crypto.timingSafeEqual(hashBuffer, derivedKey);
  }
}

// Input validation schemas
export const validationSchemas = {
  email: z.string().email().max(255),

  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),

  fileName: z.string()
    .max(255)
    .regex(/^[a-zA-Z0-9-_. ]+$/, 'Invalid file name'),

  uuid: z.string().uuid(),

  pagination:
    z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).default('desc')
    }),

  uploadFile: z.object({
    filename: z.string().max(255),
    mimetype: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9\/+\-.*]+$/),
    size: z.number().max(5 * 1024 * 1024 * 1024) // 5GB max
  })
};

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ||
    ['http://localhost:3000', 'http://localhost:5173']; // Add frontend dev server origin for local setup

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400 // 24 hours
};

// Security audit logger
export class SecurityAudit {
  static log(event: {
    action: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    resource?: string;
    result: 'success' | 'failure';
    metadata?: Record<string, any>;
  }) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      ...event,
      environment: process.env.NODE_ENV
    };
    // Log to structured logging system (e.g., console for local, or send to a log aggregator)
    console.log('SECURITY_AUDIT', JSON.stringify(auditEntry));
    // In a real production system, you'd send this to a SIEM or dedicated audit service.
    // await auditService.log(auditEntry);
  }
}

// JWT utilities
export const jwtConfig = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'noah.io',
  audience: 'noah-api',
  algorithms: ['RS256'] as const // Using RS256 requires public/private keys
};

// File upload security
export const fileUploadConfig = {
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB
    files: 10,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024, // 1MB
    fields: 20
  },

  fileFilter: (req: any, file: any, cb: Function) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/avif',
      'image/bmp',
      'image/vnd.adobe.photoshop',
      'application/postscript',
      'image/x-eps',
      'image/x-exr',
      'image/tiff',
      'image/x-dpx',
      'image/x-cineon',
      'image/x-pcx',
      'image/mpo',
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'video/x-matroska',
      'video/x-m4v',
      'video/mpeg',
      'video/mp2t',
      'video/ogg',
      'application/mxf',
      'video/mxf',
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/aac',
      'audio/flac',
      'audio/aiff',
      'audio/3gpp2',
      'audio/x-ape',
      'audio/basic',
      'audio/ogg',
      'application/pdf'
    ];

    const allowedExtensions = [
      'jpg', 'jpeg', 'jpf', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp',
      'psd', 'psb', 'ai', 'eps', 'exr', 'openexr', 'tiff', 'tif', 'pcx', 'mpo', 'dpx', 'cin',
      'mp4', 'm4v', 'mov', 'qt', 'avi', 'mkv', 'webm', 'ogg', 'mxf', 'mpeg', 'm2v', 'mpg', 'ts', 'gxf',
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'aiff', 'aif', 'aifc', '3g2', 'ape', 'au', 'mp2', 'oga',
      'pdf'
    ];

    const ext = file.originalname?.split('.').pop()?.toLowerCase() || '';

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },

  sanitizeFileName: (fileName: string): string => {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace disallowed chars with underscore
      .replace(/\.{2,}/g, '.')         // Prevent multiple dots
      .substring(0, 255);             // Truncate to max length
  }
};