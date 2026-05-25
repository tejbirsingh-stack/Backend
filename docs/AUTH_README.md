# Noah Platform Authentication System

## Overview

The Noah Platform uses a comprehensive authentication system that includes:

- Email/password authentication
- Multi-factor authentication (MFA)
- Session management
- Password reset functionality
- Role-based authorization

## Components

### Backend (API)

The backend authentication system is implemented in the `apps/api` directory:

- **Auth Routes** (`apps/api/src/routes/auth-routes.js`): API endpoints for login, registration, MFA setup, and password reset
- **Auth Service** (`apps/api/src/services/auth-service.js`): Service for handling authentication logic
- **Auth Middleware** (`apps/api/src/middleware/auth-middleware.js`): Middleware for protecting routes

### Frontend (Web App)

The frontend authentication UI is implemented in the `apps/web` directory:

- **Auth Page** (`apps/web/src/pages/AuthPage.tsx`): Login and registration UI
- **Reset Password Page** (`apps/web/src/pages/ResetPasswordPage.tsx`): Password reset UI
- **MFA Setup Component** (`apps/web/src/components/MfaSetup.tsx`): UI for setting up MFA
- **Auth Store** (`apps/web/src/stores/authStore.ts`): State management for authentication

## Features

### 1. User Authentication

- Email/password login
- Registration with organization selection
- Secure password hashing with Argon2id
- JWT-based sessions

### 2. Multi-Factor Authentication

- TOTP-based MFA (compatible with Google Authenticator, Authy, etc.)
- QR code setup
- Backup codes (planned)

### 3. Password Management

- Secure password reset via email
- Token-based password recovery
- Password strength validation

### 4. Session Management

- Multiple device sessions
- Session revocation
- Session timeout

### 5. Security Features

- Rate limiting
- Brute force protection
- Secure headers
- CORS configuration

## Environment Variables

Environment variables required for authentication are documented in `AUTH_ENV_VARIABLES.md`.

## Usage

### Login Flow

1. User enters email/password
2. If MFA is enabled, user is prompted for verification code
3. Upon successful authentication, user receives JWT token
4. Token is stored in browser and used for subsequent API requests

### MFA Setup Flow

1. User navigates to Settings > Privacy & Security
2. User clicks on "Two-Factor Authentication"
3. User scans QR code with authenticator app
4. User verifies setup by entering code from authenticator app
5. MFA is enabled for future logins

### Password Reset Flow

1. User clicks "Forgot Password" on login page
2. User enters email address
3. User receives email with password reset link
4. User sets new password
5. All existing sessions are revoked for security

## Future Enhancements

- Social login (Google, GitHub, etc.)
- Hardware token support (WebAuthn)
- OAuth 2.0 provider capabilities
- Advanced rate limiting and security controls
