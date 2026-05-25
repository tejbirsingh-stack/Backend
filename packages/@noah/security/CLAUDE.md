# CLAUDE.md - Security Package

This package provides security utilities and middleware for the Noah platform.

## Overview
Comprehensive security features including encryption, sanitization, rate limiting, and security headers.

## Key Features
- Data encryption/decryption
- Input sanitization and validation
- XSS and SQL injection protection
- Rate limiting utilities
- Security headers middleware
- CSRF protection
- Content Security Policy (CSP)

## Exports

### Encryption
```typescript
// AES-256 encryption
encrypt(data: string, key?: string): string
decrypt(encryptedData: string, key?: string): string

// Hashing
sha256(data: string): string
md5(data: string): string

// Key generation
generateSecureKey(length: number): string
generateUUID(): string
```

### Sanitization
```typescript
// Input sanitization
sanitizeHTML(html: string): string
sanitizeSQL(query: string): string
sanitizeFilename(filename: string): string
escapeRegex(string: string): string

// Validation
validateEmail(email: string): boolean
validateURL(url: string): boolean
validateUUID(uuid: string): boolean
isSecurePassword(password: string): boolean
```

### Security Middleware
```typescript
// Express/Fastify middleware
securityHeaders()
csrfProtection()
rateLimiter(options: RateLimitOptions)
corsConfig(origins: string[])
sanitizeInputs()
```

### File Security
```typescript
// File validation
validateFileType(file: File, allowedTypes: string[]): boolean
scanForVirus(filePath: string): Promise<boolean>
validateFileSize(file: File, maxSize: number): boolean
generateSecureFilename(originalName: string): string
```

## Configuration

### Security Headers
```typescript
app.use(securityHeaders({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### Rate Limiting
```typescript
app.use(rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
}));
```

## Usage Examples

### Encrypt Sensitive Data
```typescript
import { encrypt, decrypt } from '@noah/security';

// Encrypt
const encrypted = encrypt(sensitiveData);
await saveToDatabase(encrypted);

// Decrypt
const data = await getFromDatabase();
const decrypted = decrypt(data);
```

### Sanitize User Input
```typescript
import { sanitizeHTML, validateEmail } from '@noah/security';

// Clean HTML input
const cleanHTML = sanitizeHTML(userInput);

// Validate email
if (!validateEmail(email)) {
  throw new Error('Invalid email format');
}
```

### Secure File Uploads
```typescript
import { validateFileType, generateSecureFilename } from '@noah/security';

// Validate file
const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4'];
if (!validateFileType(file, allowedTypes)) {
  throw new Error('Invalid file type');
}

// Generate secure name
const secureName = generateSecureFilename(file.name);
```

## Security Best Practices

### Input Validation
- Always validate and sanitize user input
- Use parameterized queries for database operations
- Implement strict type checking
- Validate file uploads thoroughly

### Authentication & Authorization
- Use secure session management
- Implement proper RBAC
- Enable MFA for sensitive operations
- Log authentication attempts

### Data Protection
- Encrypt sensitive data at rest
- Use HTTPS for data in transit
- Implement field-level encryption for PII
- Regular security audits

### API Security
- Implement rate limiting
- Use API keys for external access
- Enable CORS with specific origins
- Monitor for suspicious activity

## Environment Variables
```env
ENCRYPTION_KEY=your-256-bit-key
CSRF_SECRET=your-csrf-secret
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000
ALLOWED_ORIGINS=http://localhost:3002,http://localhost:3000
```

## Common Security Threats

### Prevented Attacks
- **XSS**: HTML sanitization and CSP headers
- **SQL Injection**: Input sanitization and parameterized queries
- **CSRF**: Token-based protection
- **Brute Force**: Rate limiting
- **File Upload Exploits**: Type and size validation
- **Directory Traversal**: Filename sanitization

## Integration Example
```typescript
// In main API server
import { 
  securityHeaders, 
  rateLimiter, 
  sanitizeInputs 
} from '@noah/security';

app.use(securityHeaders());
app.use(rateLimiter({ max: 100 }));
app.use(sanitizeInputs());
```

## Monitoring & Alerts
- Log security events
- Monitor rate limit violations
- Track authentication failures
- Alert on suspicious patterns