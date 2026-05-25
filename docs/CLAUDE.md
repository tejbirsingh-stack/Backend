# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Noah is a Netflix-scale media asset management platform built as a monorepo using Turborepo. The platform handles media ingestion, processing, storage, and distribution with enterprise-grade security and AI-powered features.

### Core Technology Stack
- **Frontend**: React 18 with TypeScript, Vite, Tailwind CSS, Zustand for state management
- **Backend**: Fastify (Node.js) with TypeScript, Prisma ORM
- **Database**: PostgreSQL with TimescaleDB extension for time-series data
- **Storage**: MinIO (S3-compatible) for media files, B2 cloud storage integration
- **Caching**: Redis with Sentinel for HA
- **Message Queue**: Kafka for event streaming, BullMQ for job processing
- **Authentication**: JWT-based with MFA support, session management
- **Container Orchestration**: Docker Compose for development, Kubernetes-ready for production

### Monorepo Structure
```
apps/
├── api/           # Main Fastify API server
├── web/           # React web application
├── compression/   # Rust-based media compression service
├── ai-service/    # AI processing for metadata extraction
├── billing/       # Stripe integration for payments
├── storage/       # B2/S3 storage service
├── premiere-panel/# Adobe Premiere Pro extension
└── mobile/        # React Native mobile app

packages/
├── @noah/db/      # Prisma database models and migrations
├── @noah/auth/    # Authentication utilities
├── @noah/security/# Security utilities
└── @noah/logger/  # Centralized logging
```

## Development Commands

### Initial Setup
```bash
# Install dependencies
npm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Build packages first (required for monorepo)
npm run build:packages
```

### Database Management
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Push schema changes (development)
npm run db:push

# Open Prisma Studio
npm run db:studio
```

### Development Server
```bash
# Start all services with Docker
npm run docker:up

# Start development servers (uses Turbo)
npm run dev

# Start specific apps
npm run start:api    # API server on port 4000
npm run start:web    # Web app on port 3000
npm run start:compression  # Rust compression service

# Or use the simple API for testing
cd apps/api && PORT=4000 npm run dev:simple
```

### Testing & Quality
```bash
# Run all tests
npm run test

# Run tests with coverage
cd apps/web && npm run test:coverage

# Lint all packages
npm run lint

# Type checking
npm run typecheck
```

### Docker Operations
```bash
# Development environment
npm run docker:up     # Start all services
npm run docker:down   # Stop services
npm run docker:reset  # Reset with volume cleanup

# Simple setup (minimal services)
npm run docker:simple

# Production deployment
./scripts/prod-start.sh  # Linux/macOS
scripts\prod-start.bat   # Windows
```

### Build & Deploy
```bash
# Build all packages
npm run build

# Clean build artifacts
npm run clean
```

## Key Implementation Details

### Authentication Flow
The platform uses JWT-based authentication with refresh tokens stored in the database. MFA is implemented using TOTP (Time-based One-Time Passwords). Sessions are tracked in the `UserSession` model with automatic expiration handling.

Key files:
- `apps/api/src/services/auth.service.ts` - Core authentication logic
- `apps/api/src/middleware/auth-middleware.js` - JWT verification middleware
- `apps/web/src/stores/authStore.ts` - Frontend auth state management

### Media Processing Pipeline
1. Files uploaded to `apps/api/uploads/` temporarily
2. Processed and moved to MinIO/B2 storage
3. Thumbnails generated and stored separately
4. Metadata extracted and stored in PostgreSQL
5. AI service analyzes content for automatic tagging

Key files:
- `apps/api/src/services/media.service.ts` - Media handling logic
- `apps/api/src/services/compression.service.ts` - Compression integration
- `apps/api/src/routes/media.js` - Media API endpoints

### Database Schema
The database uses UUID primary keys throughout and includes:
- Multi-tenancy support via `Organization` model
- Comprehensive audit logging with TimescaleDB hypertables
- Media versioning and collection management
- Share links with permission controls
- Analytics event tracking

Schema location: `packages/@noah/db/prisma/schema.prisma`

### Frontend Architecture
The web app uses:
- React Router for navigation
- Zustand for global state management
- React Query for server state and caching
- Tailwind CSS with custom design system
- Professional video player with advanced controls

Main entry points:
- `apps/web/src/App.tsx` - Application root
- `apps/web/src/pages/` - Page components
- `apps/web/src/components/` - Reusable components
- `apps/web/src/stores/` - Zustand stores

## Environment Variables

Critical environment variables (see ENV_VARIABLES.md for full list):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT signing
- `REDIS_URL` - Redis connection
- `MINIO_*` - MinIO/S3 configuration
- `B2_*` - Backblaze B2 credentials
- `VITE_API_URL` - API endpoint for frontend

## Service URLs (Development)

| Service | URL | Default Credentials |
|---------|-----|-------------------|
| Web App | http://localhost:3000 | Register new account |
| API | http://localhost:4000 | - |
| MinIO Console | http://localhost:9001 | noah_minio_user / noah_minio_password |
| PostgreSQL | localhost:5432 | noah_user / noah_dev_password |
| Redis | localhost:6379 | noah_redis_password |

## Port Configuration

- **Web Applications**: Start at port 3000 and increment (3001, 3002, ...)
- **API Services**: Start at port 4000 and increment (4001, 4002, ...)
- **Database Services**: 5432 (PostgreSQL), 6379 (Redis)
- **Storage Services**: 9000 (MinIO), 9001 (MinIO Console)

## Demo Readiness Refactor - V2 (August 11, 2025)

### Architecture Changes
This refactor improved the user experience to match the original demo video with seamless in-page media viewing:

#### Core Changes
- **Removed Modal-Based Viewing**: Eliminated MediaViewer and MediaPreviewModal components for primary viewing
- **In-Page Media Viewer**: InPageMediaViewer component provides full-screen viewing experience
- **Streamlined Layout**: Removed redundant sidebars and cleaned up the main App.tsx structure
- **Fixed Scrolling**: Media browser grid now scrolls independently within its container
- **Authentication Placeholder**: Added "Using Mock Authentication" indicator in header
- **Upload Placeholder**: Upload button logs placeholder message for future API integration

#### Modified Files
- `apps/web/src/App.tsx` - Simplified layout, removed duplicate sidebars, added auth indicator
- `apps/web/src/pages/MediaBrowser.tsx` - Removed Navbar/Sidebar imports, fixed scrolling container
- `apps/web/src/components/InPageMediaViewer.tsx` - Already implemented with two-panel layout
- `apps/web/src/components/EnhancedProfessionalVideoPlayer.tsx` - Fully functional with annotations

#### User Experience Flow
1. Login with any email and password (6+ characters)
2. Browse media in grid or list view
3. Click any asset to open in-page viewer
4. Video plays with professional controls and annotation support
5. Details panel shows metadata and comments
6. "Back to Browser" button returns to grid
7. Grid scrolls independently without full page scroll

#### Key Features Working
- ✅ In-page media viewing (no modals)
- ✅ Professional video player with custom controls
- ✅ Annotation markers on timeline
- ✅ Details panel with metadata
- ✅ Independent grid scrolling
- ✅ Clean single sidebar navigation
- ✅ Mock authentication indicator
- ✅ Upload placeholder for future integration

## Important Patterns

### API Error Handling
All API endpoints should return consistent error responses:
```typescript
{
  error: string,
  message: string,
  statusCode: number,
  details?: any
}
```

### File Upload Flow
1. Use multipart form data to `/api/media/upload`
2. Server validates file type and size
3. Generates unique filename with UUID
4. Processes and stores in appropriate storage tier
5. Returns media asset metadata

### State Management
- Use Zustand stores for global state
- Keep component state local when possible
- Use React Query for server state
- Implement optimistic updates for better UX

## Security Considerations

- All API routes except auth endpoints require JWT authentication
- Rate limiting implemented on sensitive endpoints
- File uploads validated for type and size
- SQL injection prevented via Prisma parameterized queries
- XSS protection through React's default escaping
- CORS configured for production domains only

## Recent Updates (August 12, 2025)

### Video Player Improvements
- **Fixed Control Visibility**: Resolved persistent issue with controls being cut off at bottom
  - Changed from flexbox to absolute positioning for more reliable layout
  - Controls now fixed at bottom with 100px height and z-index 50
  - Video container uses padding-bottom to reserve space for controls

### UI Enhancements
- **Collapsible Right Panel**: Added toggle button in header to show/hide comments panel
  - Provides more screen real estate for video viewing
  - Smooth transitions with proper state management
  - Icons change based on panel visibility state

### Media Browser Updates
- **Branding**: Updated main title to "Media Library - Your Ark"
- **Folder Navigation**: Full recursive folder support with navigation
- **System File Filtering**: Filters out nul, .DS_Store, and other system files
- **File Organization**: Proper folder structure with file/folder count badges

## Vercel Deployment Fix and Code Consolidation (August 27, 2025)

### Overview
This refactor resolved all TypeScript compilation errors and consolidated the media viewing components to achieve a successful build on Vercel. The codebase is now cleaner with a single, working InPageMediaViewer component architecture.

### Changes Made

#### 1. Removed Obsolete Files
The following conflicting and unused files were removed to eliminate compilation errors:
- `src/components/EnhancedProfessionalVideoPlayer-old.tsx`
- `src/components/SimpleVideoContainer.tsx`
- `src/pages/VideoPlayerDemo.tsx`
- `src/pages/VideoPlayerTest.tsx`
- `src/pages/VideoPlayerTestPage.tsx`
- `src/components/media/MediaPreviewModal.tsx`
- `src/components/media/MediaPreviewModal.fixed.tsx`
- `src/components/DetailsPanelWithAnnotations.tsx`

#### 2. Type Definition Consolidation
- All type definitions (Annotation, Comment, DrawingData, MediaAssetDetails, etc.) are now exported from `InPageMediaViewer.tsx` as the single source of truth
- Components import these types from InPageMediaViewer to maintain consistency
- Fixed type mismatches throughout the codebase

#### 3. State Management Centralization
- InPageMediaViewer now manages all annotation state centrally
- Proper prop drilling to EnhancedProfessionalVideoPlayer and DetailsPanelWithAnnotationsEnhanced
- Annotations are persisted in localStorage per asset
- Comment replies are handled through the annotation update mechanism

#### 4. Fixed Environment Variable Access
- Created `src/vite-env.d.ts` for proper Vite environment variable typing
- All environment variables properly prefixed with `VITE_`
- Fixed `import.meta.env` TypeScript errors

#### 5. Component Integration Updates
- DetailsPanelWithAnnotationsEnhanced now uses annotations prop instead of local mock data
- Comments are filtered from annotations array by type
- All handlers properly typed with correct interfaces
- Fixed rendering issues with Date objects

#### 6. Build System Fixes
- TypeScript compilation now passes without errors
- All imports reference existing files
- Proper type annotations throughout
- Fixed Lucide React icon prop issues

### Files Modified
- `apps/web/src/components/InPageMediaViewer.tsx` - Centralized types and state management
- `apps/web/src/components/DetailsPanelWithAnnotationsEnhanced.tsx` - Updated to use proper types and props
- `apps/web/src/components/EnhancedProfessionalVideoPlayer.tsx` - Fixed function reference
- `apps/web/src/components/UploadModal.tsx` - Fixed icon prop issue
- `apps/web/src/components/media/index.ts` - Removed deleted component exports
- `apps/web/src/App.tsx` - Removed unused imports

### Files Created
- `apps/web/src/vite-env.d.ts` - TypeScript definitions for Vite environment variables

### Build Verification
The application now builds successfully with:
```bash
cd apps/web && npx tsc --noEmit  # No errors
npm run build                     # Successful build
```

### Key Benefits
- ✅ Clean TypeScript compilation with no errors
- ✅ Single source of truth for type definitions
- ✅ Centralized state management for annotations
- ✅ Removed duplicate and conflicting components
- ✅ Ready for Vercel deployment
- ✅ Maintainable codebase structure