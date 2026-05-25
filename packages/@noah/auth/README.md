# Noah Platform Authentication and Authorization

This module implements a comprehensive authentication and authorization system for the Noah platform, including multi-factor authentication (MFA), session management, and password recovery.

## Features

- **Secure Authentication**
  - Email and password authentication
  - Account lockout after multiple failed attempts
  - Rate limiting to prevent brute force attacks
  - JWT-based tokens with refresh capabilities

- **Multi-Factor Authentication (MFA)**
  - TOTP (Time-based One-Time Password) using Google Authenticator, Authy, etc.
  - QR code generation for easy setup
  - Backup codes for recovery

- **Session Management**
  - Multiple concurrent sessions with device info
  - Session expiration and revocation
  - Device tracking and suspicious login detection

- **Password Security**
  - Argon2id password hashing (state-of-the-art algorithm)
  - Password strength validation
  - Secure password reset flow

- **Authorization**
  - Role-based access control
  - Organization-level access control
  - Middleware for protecting routes

## Installation

```bash
npm install @noah/auth
```

## Usage

### Integration with Noah API

To integrate the authentication system with the Noah API:

1. Install the module in your API service:
   ```bash
   cd apps/api
   npm install @noah/auth
   ```

2. Update your API's entry point (e.g., `apps/api/src/index.ts`):
   ```typescript
   import express from 'express';
   import { createAuthRouter, authenticate, authorize } from '@noah/auth';
   
   const app = express();
   
   // Parse JSON body
   app.use(express.json());
   
   // Mount authentication routes
   app.use('/api/auth', createAuthRouter());
   
   // Protected routes example
   app.use('/api/media', authenticate, require('./routes/media.routes'));
   app.use('/api/admin', authenticate, authorize(['admin']), require('./routes/admin.routes'));
   ```

3. Set up the required environment variables as described below.

### Basic Setup

```typescript
import { createAuthRouter, authenticate, authorize } from '@noah/auth';
import express from 'express';

const app = express();

// Add authentication routes
app.use('/api/auth', createAuthRouter());

// Protect a route with authentication
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: 'This route is protected' });
});

// Protect a route with role-based authorization
app.get('/api/admin', authenticate, authorize(['admin']), (req, res) => {
  res.json({ message: 'Admin access only' });
});
```

### Authentication Flow

1. **Registration**
   - User registers with email, password, and organization ID
   - Password is validated for strength and hashed using Argon2id
   - User is created in the database

2. **Login**
   - User provides email and password
   - System verifies credentials and checks account status
   - If MFA is enabled, user must provide TOTP code
   - On successful authentication, system issues JWT tokens

3. **Session Management**
   - Each login creates a new session
   - Sessions can be viewed and revoked by the user
   - Access tokens are short-lived (15 minutes by default)
   - Refresh tokens allow obtaining new access tokens

4. **MFA Setup**
   - User enables MFA through a setup process
   - System generates a TOTP secret and QR code
   - User verifies setup by entering a code
   - Backup codes are provided for recovery

5. **Password Reset**
   - User requests password reset via email
   - System generates and stores a unique reset token
   - User receives email with reset link
   - Token is validated and new password is set

## Database Schema

The module uses the following Prisma models:

- `User`: Core user information including MFA settings
- `UserSession`: Session tracking and management
- `PasswordResetToken`: Password reset request tracking

## Security Considerations

- All passwords are hashed using Argon2id with secure parameters
- Authentication attempts are rate-limited to prevent brute force attacks
- JWT tokens are signed with separate secrets for access and refresh tokens
- MFA provides an additional layer of security
- Sessions track IP address and user agent for suspicious activity detection
- Account lockout mechanism prevents repeated password guessing

## Environment Variables

- `ACCESS_TOKEN_SECRET`: Secret for signing access tokens
- `REFRESH_TOKEN_SECRET`: Secret for signing refresh tokens
- `ACCESS_TOKEN_EXPIRY`: Expiry time for access tokens (default: 15m)
- `REFRESH_TOKEN_EXPIRY`: Expiry time for refresh tokens (default: 7d)
- `MFA_ISSUER`: Issuer name for TOTP apps (default: 'Noah Media Platform')

### Setting Up Environment Variables

For development, you need to add the following variables to your project's `.env` file:

```bash
# Authentication
ACCESS_TOKEN_SECRET=your_secure_random_string_here
REFRESH_TOKEN_SECRET=another_secure_random_string_here
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
MFA_ISSUER=Noah Media Platform
AUTH_RATE_LIMIT_POINTS=5
AUTH_RATE_LIMIT_DURATION=900
```

#### Obtaining Environment Variable Values

Here's how to obtain each value:

1. **ACCESS_TOKEN_SECRET** and **REFRESH_TOKEN_SECRET**: 
   These should be different, cryptographically secure random strings. Generate them using one of these methods:
   
   ```bash
   # In Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Using OpenSSL
   openssl rand -hex 32
   
   # In PowerShell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::Create().GetBytes(32))
   ```
   
   Example output: `3a7c24a5e8d631c621f6b0494a5a8ec0a4a93cce25d806bd0e3d512c3ad4775a`

2. **ACCESS_TOKEN_EXPIRY** and **REFRESH_TOKEN_EXPIRY**:
   - Format: `<number><unit>` where unit is:
     - `s` for seconds
     - `m` for minutes
     - `h` for hours
     - `d` for days
   - Recommended values:
     - Access token: `15m` (15 minutes)
     - Refresh token: `7d` (7 days)

3. **MFA_ISSUER**:
   - This appears in authenticator apps (like Google Authenticator) to identify your service
   - Typically your application/company name
   - Recommended value: `"Noah Media Platform"`

4. **AUTH_RATE_LIMIT_POINTS**:
   - Maximum number of login attempts before rate limiting is applied
   - Recommended value: `5`

5. **AUTH_RATE_LIMIT_DURATION**:
   - Duration of the rate limit window in seconds
   - Recommended value: `900` (15 minutes)

For production environments, set these variables using your deployment platform's environment management system (e.g., Kubernetes secrets, AWS Parameter Store, etc.).

#### Environment Variable Priority

The system loads environment variables in the following order (highest priority first):
1. Process environment variables
2. `.env.{NODE_ENV}.local` file
3. `.env.local` file (skipped when NODE_ENV is 'test')
4. `.env.{NODE_ENV}` file
5. `.env` file

If no environment variables are found, the system will use default development values, but this is **not recommended for production**.

## Testing the Authentication System

### Running Tests

The authentication module includes comprehensive tests. Run them with:

```bash
cd packages/@noah/auth
npm test
```

### Manual Testing

You can manually test the authentication system using cURL or Postman:

#### Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"user@example.com","password":"StrongP@ssw0rd","orgId":"your-org-id"}'
```

#### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongP@ssw0rd"}'
```

#### Access Protected Route
```bash
curl -X GET http://localhost:3000/api/protected \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```
