# CLAUDE.md - API Service

This folder contains the main Fastify API server for the Noah media asset management platform.

## Overview
The API service handles all backend operations including authentication, media management, storage, and real-time features.

## Key Files

### Core Server Files
- `src/index.ts` - Main API server entry point with Fastify setup
- `src/enhanced-media-server.cjs` - Standalone media server (runs on port 3000)
- `src/simple-api.ts` - Simplified API for testing

### Services
- `src/services/auth.service.ts` - JWT authentication, MFA, session management
- `src/services/media.service.ts` - Media upload, processing, and management
- `src/services/compression.service.ts` - Integration with Rust compression service
- `src/services/media-asset.service.js` - Media asset database operations

### Routes
- `src/routes/auth.js` - Authentication endpoints (login, register, MFA)
- `src/routes/media.js` - Media CRUD operations
- `src/routes/health.js` - Health check endpoints

### Middleware
- `src/middleware/auth-middleware.js` - JWT verification and protection
- `src/middleware/rate-limit.js` - Rate limiting for API endpoints

## Running the Server

### Development
```bash
# Standard API server (full features)
npm run dev

# Enhanced media server (simplified, port 3000)
node src/enhanced-media-server.cjs

# Simple API (minimal features, testing)
npm run dev:simple
```

### Environment Variables
Key variables needed in `.env`:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - Secret for JWT signing
- `REDIS_URL` - Redis connection for sessions
- `MINIO_*` - MinIO/S3 configuration
- `PORT` - Server port (default: 4000 for main, 3000 for enhanced)

## API Endpoints

### Enhanced Media Server (port 3000)
- `GET /api/health` - Health check
- `GET /api/media` - List all media assets
- `POST /api/media/upload` - Upload file (multipart/form-data)
- `DELETE /api/media/:filename` - Delete file
- `GET /uploads/:filename` - Serve static files

### Main API Server (port 4000)
- Authentication: `/api/auth/*`
- Media: `/api/media/*`
- Users: `/api/users/*`
- Analytics: `/api/analytics/*`

## Important Notes

### CORS Configuration
- Enhanced media server accepts origins from ports 3001-3010, 5173
- Main API uses more restrictive CORS based on environment

### File Storage
- Uploads stored in `noah/uploads/` directory (root level)
- Enhanced server serves files directly via Express static
- Main API integrates with MinIO/S3 for production storage

### Database
- Uses Prisma ORM with PostgreSQL
- Schema defined in `packages/@noah/db/prisma/schema.prisma`
- Run migrations with `npm run db:migrate`

## Testing
```bash
# Run tests
npm test

# Test with curl
curl http://localhost:3000/api/health
curl http://localhost:3000/api/media
```

## Common Issues

### Port Already in Use
- Check if another service is running on port 3000/4000
- Use `PORT=3001 node src/enhanced-media-server.cjs` to change port

### CORS Errors
- Frontend on port 3002 uses Vite proxy to avoid CORS
- Direct browser access needs proper CORS headers

### File Upload Failures
- Check `uploads/` directory permissions
- Verify multer configuration for file size limits (500MB)