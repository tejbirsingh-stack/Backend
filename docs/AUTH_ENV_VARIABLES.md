# Noah Platform Authentication Environment Variables

## API Server Environment Variables
# Used in apps/api/.env

# JWT Secret (used for signing authentication tokens)
JWT_SECRET=your_secure_jwt_secret_key_at_least_32_characters

# JWT Token Expiry Time
JWT_EXPIRE=15m

# JWT Refresh Token Expiry Time
JWT_REFRESH_EXPIRE=7d

# Cookie Secret (for secure cookie sessions)
COOKIE_SECRET=your_secure_cookie_secret_key_at_least_32_characters

# MFA Issuer Name (shown in authenticator apps)
MFA_ISSUER=Noah Media Platform

# Frontend URL (for password reset links)
FRONTEND_URL=http://localhost:3000

# Email Service Configuration for Password Reset
EMAIL_FROM=no-reply@noah-platform.com
EMAIL_HOST=smtp.yourprovider.com
EMAIL_PORT=587
EMAIL_USER=your_smtp_username
EMAIL_PASSWORD=your_smtp_password
EMAIL_SECURE=false

## Web App Environment Variables
# Used in apps/web/.env

# API URL (backend endpoint)
REACT_APP_API_URL=http://localhost:3001

# Example values for development environment:

## API Server (.env)
# JWT_SECRET=development_jwt_secret_key_replace_in_production
# JWT_EXPIRE=15m
# JWT_REFRESH_EXPIRE=7d
# COOKIE_SECRET=development_cookie_secret_key_replace_in_production
# MFA_ISSUER=Noah Media Platform (Dev)
# FRONTEND_URL=http://localhost:3000
# EMAIL_FROM=no-reply@noah-platform.com
# EMAIL_HOST=smtp.mailtrap.io
# EMAIL_PORT=2525
# EMAIL_USER=your_mailtrap_user
# EMAIL_PASSWORD=your_mailtrap_password
# EMAIL_SECURE=false

## Web App (.env)
# REACT_APP_API_URL=http://localhost:3001
