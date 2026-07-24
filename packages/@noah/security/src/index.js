"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileUploadConfig = exports.jwtConfig = exports.SecurityAudit = exports.corsOptions = exports.validationSchemas = exports.Encryption = exports.rateLimiters = exports.securityHeaders = exports.cspConfig = void 0;
// packages/@noah/security/src/index.ts
var crypto = require("crypto");
var util_1 = require("util");
var helmet_1 = require("helmet");
var express_rate_limit_1 = require("express-rate-limit");
var zod_1 = require("zod");
var scrypt = (0, util_1.promisify)(crypto.scrypt);
// Content Security Policy configuration
exports.cspConfig = {
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.datadog-rum.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: [
            "'self'",
            'https://api.noah.io', // Placeholder, replace with your actual domain
            'wss://api.noah.io', // Placeholder, replace with your actual domain
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
var securityHeaders = function () {
    return (0, helmet_1.default)({
        contentSecurityPolicy: exports.cspConfig,
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
exports.securityHeaders = securityHeaders;
// Rate limiting configurations
exports.rateLimiters = {
    general: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: 'Too many requests from this IP',
        standardHeaders: true,
        legacyHeaders: false,
        handler: function (req, res) {
            res.status(429).json({
                error: 'Too many requests',
                retryAfter: req.rateLimit.resetTime
            });
        }
    }),
    auth: (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 5,
        skipSuccessfulRequests: true,
        message: 'Too many authentication attempts'
    }),
    upload: (0, express_rate_limit_1.default)({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 50,
        message: 'Upload limit exceeded'
    }),
    api: (0, express_rate_limit_1.default)({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 60,
        keyGenerator: function (req) {
            var _a;
            // req.user will come from JWT validation in the API gateway/auth service
            return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || req.ip;
        }
    })
};
// Encryption utilities
var Encryption = /** @class */ (function () {
    function Encryption() {
    }
    Encryption.encrypt = function (text, masterKey) {
        return __awaiter(this, void 0, void 0, function () {
            var salt, key, iv, cipher, encrypted, tag;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        salt = crypto.randomBytes(this.saltLength);
                        return [4 /*yield*/, scrypt(masterKey, salt, this.keyLength)];
                    case 1:
                        key = _a.sent();
                        iv = crypto.randomBytes(this.ivLength);
                        cipher = crypto.createCipheriv(this.algorithm, key, iv);
                        encrypted = Buffer.concat([
                            cipher.update(text, 'utf8'),
                            cipher.final()
                        ]);
                        tag = cipher.getAuthTag();
                        return [2 /*return*/, Buffer.concat([
                                salt,
                                iv,
                                tag,
                                encrypted
                            ]).toString('base64')];
                }
            });
        });
    };
    Encryption.decrypt = function (encryptedData, masterKey) {
        return __awaiter(this, void 0, void 0, function () {
            var data, salt, iv, tag, encrypted, key, decipher, decrypted;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = Buffer.from(encryptedData, 'base64');
                        salt = data.slice(0, this.saltLength);
                        iv = data.slice(this.saltLength, this.saltLength + this.ivLength);
                        tag = data.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
                        encrypted = data.slice(this.saltLength + this.ivLength + this.tagLength);
                        return [4 /*yield*/, scrypt(masterKey, salt, this.keyLength)];
                    case 1:
                        key = _a.sent();
                        decipher = crypto.createDecipheriv(this.algorithm, key, iv);
                        decipher.setAuthTag(tag);
                        decrypted = Buffer.concat([
                            decipher.update(encrypted),
                            decipher.final()
                        ]);
                        return [2 /*return*/, decrypted.toString('utf8')];
                }
            });
        });
    };
    Encryption.generateSecureToken = function (length) {
        if (length === void 0) { length = 32; }
        return crypto.randomBytes(length).toString('base64url');
    };
    Encryption.hash = function (data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    };
    Encryption.hashPassword = function (password) {
        return __awaiter(this, void 0, void 0, function () {
            var salt, hash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        salt = crypto.randomBytes(16).toString('hex');
                        return [4 /*yield*/, scrypt(password, salt, 64)];
                    case 1:
                        hash = _a.sent();
                        return [2 /*return*/, "".concat(salt, ":").concat(hash.toString('hex'))];
                }
            });
        });
    };
    Encryption.verifyPassword = function (password, hashedPassword) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, salt, hash, hashBuffer, derivedKey;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = hashedPassword.split(':'), salt = _a[0], hash = _a[1];
                        hashBuffer = Buffer.from(hash, 'hex');
                        return [4 /*yield*/, scrypt(password, salt, 64)];
                    case 1:
                        derivedKey = _b.sent();
                        return [2 /*return*/, crypto.timingSafeEqual(hashBuffer, derivedKey)];
                }
            });
        });
    };
    Encryption.algorithm = 'aes-256-gcm';
    Encryption.keyLength = 32;
    Encryption.ivLength = 16;
    Encryption.saltLength = 64;
    Encryption.tagLength = 16;
    return Encryption;
}());
exports.Encryption = Encryption;
// Input validation schemas
exports.validationSchemas = {
    email: zod_1.z.string().email().max(255),
    password: zod_1.z.string()
        .min(12, 'Password must be at least 12 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    fileName: zod_1.z.string()
        .max(255)
        .regex(/^[a-zA-Z0-9-_. ]+$/, 'Invalid file name'),
    uuid: zod_1.z.string().uuid(),
    pagination: zod_1.z.object({
        page: zod_1.z.coerce.number().min(1).default(1),
        limit: zod_1.z.coerce.number().min(1).max(100).default(20),
        sortBy: zod_1.z.string().optional(),
        sortOrder: zod_1.z.enum(['asc', 'desc']).default('desc')
    }),
    uploadFile: zod_1.z.object({
        filename: zod_1.z.string().max(255),
        mimetype: zod_1.z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9\/+\-.*]+$/),
        size: zod_1.z.number().max(5 * 1024 * 1024 * 1024) // 5GB max
    })
};
// CORS configuration
exports.corsOptions = {
    origin: function (origin, callback) {
        var _a;
        var allowedOrigins = ((_a = process.env.ALLOWED_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(',')) ||
            ['http://localhost:3000', 'http://localhost:5173']; // Add frontend dev server origin for local setup
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
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
var SecurityAudit = /** @class */ (function () {
    function SecurityAudit() {
    }
    SecurityAudit.log = function (event) {
        var auditEntry = __assign(__assign({ timestamp: new Date().toISOString() }, event), { environment: process.env.NODE_ENV });
        // Log to structured logging system (e.g., console for local, or send to a log aggregator)
        console.log('SECURITY_AUDIT', JSON.stringify(auditEntry));
        // In a real production system, you'd send this to a SIEM or dedicated audit service.
        // await auditService.log(auditEntry);
    };
    return SecurityAudit;
}());
exports.SecurityAudit = SecurityAudit;
// JWT utilities
exports.jwtConfig = {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    issuer: 'noah.io',
    audience: 'noah-api',
    algorithms: ['RS256'] // Using RS256 requires public/private keys
};
// File upload security
exports.fileUploadConfig = {
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024, // 5GB
        files: 10,
        fieldNameSize: 100,
        fieldSize: 1024 * 1024, // 1MB
        fields: 20
    },
    fileFilter: function (req, file, cb) {
        var _a, _b;
        var allowedMimeTypes = [
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
        var allowedExtensions = [
            'jpg', 'jpeg', 'jpf', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp',
            'psd', 'psb', 'ai', 'eps', 'exr', 'openexr', 'tiff', 'tif', 'pcx', 'mpo', 'dpx', 'cin',
            'mp4', 'm4v', 'mov', 'qt', 'avi', 'mkv', 'webm', 'ogg', 'mxf', 'mpeg', 'm2v', 'mpg', 'ts', 'gxf',
            'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'aiff', 'aif', 'aifc', '3g2', 'ape', 'au', 'mp2', 'oga',
            'pdf'
        ];
        var ext = ((_b = (_a = file.originalname) === null || _a === void 0 ? void 0 : _a.split('.').pop()) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
        if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type'));
        }
    },
    sanitizeFileName: function (fileName) {
        return fileName
            .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace disallowed chars with underscore
            .replace(/\.{2,}/g, '.') // Prevent multiple dots
            .substring(0, 255); // Truncate to max length
    }
};
