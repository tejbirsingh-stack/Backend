# CLAUDE.md - Auth Package

This package provides shared authentication utilities and middleware for the Noah platform.

## Overview
Centralized authentication logic including JWT handling, MFA support, and session management.

## Key Features
- JWT token generation and verification
- TOTP-based MFA implementation
- Session management utilities
- Password hashing with bcrypt
- Role-based access control (RBAC)

## Exports

### Functions
```typescript
// Token management
generateAccessToken(userId: string): string
generateRefreshToken(): string
verifyToken(token: string): JWTPayload
decodeToken(token: string): JWTPayload

// Password utilities
hashPassword(password: string): Promise<string>
verifyPassword(password: string, hash: string): Promise<boolean>
validatePasswordStrength(password: string): ValidationResult

// MFA
generateTOTPSecret(): TOTPSecret
verifyTOTPToken(secret: string, token: string): boolean
generateBackupCodes(): string[]

// Session
createSession(userId: string): Promise<Session>
validateSession(token: string): Promise<Session | null>
revokeSession(sessionId: string): Promise<void>
```

### Middleware
```typescript
// Express/Fastify middleware
authenticate(req, res, next)
requireRole(role: string)
requireMFA
rateLimitAuth
```

### Types
```typescript
interface JWTPayload {
  userId: string
  email: string
  role: string
  organizationId?: string
  exp: number
  iat: number
}

interface Session {
  id: string
  userId: string
  token: string
  refreshToken: string
  expiresAt: Date
  deviceInfo?: DeviceInfo
}
```

## Configuration

### Environment Variables
```env
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
MFA_ISSUER=Noah Platform
BCRYPT_ROUNDS=10
```

### Usage Examples

#### Generate Tokens
```typescript
import { generateAccessToken, generateRefreshToken } from '@noah/auth';

const accessToken = generateAccessToken(userId);
const refreshToken = generateRefreshToken();
```

#### Verify Password
```typescript
import { verifyPassword } from '@noah/auth';

const isValid = await verifyPassword(inputPassword, hashedPassword);
```

#### Setup MFA
```typescript
import { generateTOTPSecret, verifyTOTPToken } from '@noah/auth';

// Setup
const secret = generateTOTPSecret();
// Show QR code to user

// Verify
const isValid = verifyTOTPToken(secret.base32, userToken);
```

## Security Best Practices
- Rotate JWT_SECRET regularly
- Use short expiration for access tokens (15 min)
- Implement refresh token rotation
- Store sensitive data in environment variables
- Use HTTPS in production
- Implement rate limiting on auth endpoints

## Integration with API

### Protecting Routes
```typescript
// In API routes
import { authenticate, requireRole } from '@noah/auth';

router.get('/admin', 
  authenticate,
  requireRole('admin'),
  handler
);
```

### Session Management
```typescript
// Login
const session = await createSession(user.id);
res.json({ 
  accessToken: session.token,
  refreshToken: session.refreshToken 
});

// Logout
await revokeSession(sessionId);
```

## Error Handling
Common auth errors:
- `TokenExpiredError` - JWT expired
- `InvalidTokenError` - Malformed or invalid JWT
- `MFARequiredError` - MFA token needed
- `InsufficientPermissionsError` - Role check failed