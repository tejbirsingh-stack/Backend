# Authentication Implementation Plan

## Overview
Implement real user authentication with database integration, supporting both local development and production deployment (Railway/Vercel).

## Phase 1: Database Setup

### 1.1 User Schema
```prisma
model User {
  id                String          @id @default(uuid())
  email             String          @unique
  password          String          // Hashed with bcrypt
  firstName         String?
  lastName          String?
  role              UserRole        @default(USER)
  organizationId    String
  organization      Organization    @relation(fields: [organizationId], references: [id])
  isActive          Boolean         @default(true)
  emailVerified     Boolean         @default(false)
  lastLogin         DateTime?
  sessions          UserSession[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model Organization {
  id                String          @id @default(uuid())
  name              String
  slug              String          @unique
  description       String?
  users             User[]
  mediaAssets       MediaAsset[]
  storageQuota      BigInt          @default(10737418240) // 10GB default
  storageUsed       BigInt          @default(0)
  b2BucketPrefix    String?         // For org-specific B2 paths
  settings          Json?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model UserSession {
  id                String          @id @default(uuid())
  userId            String
  user              User            @relation(fields: [userId], references: [id])
  token             String          @unique
  refreshToken      String          @unique
  expiresAt         DateTime
  ipAddress         String?
  userAgent         String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

enum UserRole {
  ADMIN
  USER
  VIEWER
}
```

### 1.2 Media Asset Permissions
```prisma
model MediaAsset {
  id                String          @id @default(uuid())
  filename          String
  originalName      String
  path              String
  size              BigInt
  mimeType          String
  organizationId    String
  organization      Organization    @relation(fields: [organizationId], references: [id])
  uploadedById      String
  uploadedBy        User            @relation(fields: [uploadedById], references: [id])
  tags              String[]
  metadata          Json?
  b2Key             String?         // B2 storage key
  isPublic          Boolean         @default(false)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}
```

## Phase 2: Authentication API

### 2.1 Core Auth Endpoints
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/logout` - Invalidate session
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/register` - Register new user (admin only initially)

### 2.2 JWT Strategy
```javascript
// Token payload
{
  userId: "uuid",
  email: "user@example.com",
  organizationId: "uuid",
  organizationSlug: "visit-detroit",
  role: "ADMIN",
  iat: 1234567890,
  exp: 1234567890
}

// Access token: 15 minutes
// Refresh token: 7 days
```

### 2.3 Auth Middleware
```javascript
// Protect routes
app.use('/api/media/*', authenticateToken);
app.use('/api/sync/*', authenticateToken);
app.use('/api/storage/*', authenticateToken);

// Organization-scoped access
function checkOrgAccess(req, res, next) {
  const { organizationId } = req.user;
  // Verify user can access requested resources
}
```

## Phase 3: Initial Data Setup

### 3.1 Seed Script
```javascript
// Create Visit Detroit organization
const visitDetroit = await prisma.organization.create({
  data: {
    name: "Visit Detroit",
    slug: "visit-detroit",
    description: "Detroit's official convention and visitors bureau",
    b2BucketPrefix: "visit-detroit/",
    settings: {
      allowedFileTypes: ["video", "image", "audio", "document"],
      maxFileSize: 5368709120, // 5GB
      features: {
        b2Storage: true,
        autoCompress: true,
        aiTagging: false
      }
    }
  }
});

// Create admin user
const adminUser = await prisma.user.create({
  data: {
    email: "admin@visitdetroit.com",
    password: await bcrypt.hash("VisitDetroit2024!", 10),
    firstName: "Admin",
    lastName: "User",
    role: "ADMIN",
    organizationId: visitDetroit.id,
    isActive: true,
    emailVerified: true
  }
});

// Development debug user (optional)
const debugUser = await prisma.user.create({
  data: {
    email: "debug@test.com",
    password: await bcrypt.hash("debug123", 10),
    firstName: "Debug",
    lastName: "User",
    role: "ADMIN",
    organizationId: visitDetroit.id,
    isActive: true,
    emailVerified: true
  }
});
```

## Phase 4: Frontend Integration

### 4.1 Auth Store Updates
```typescript
// stores/authStore.ts
interface AuthStore {
  user: User | null;
  organization: Organization | null;
  token: string | null;
  isAuthenticated: boolean;
  
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
```

### 4.2 Protected Routes
```typescript
// App.tsx
<Route element={<ProtectedRoute />}>
  <Route path="/media" element={<MediaBrowser />} />
  <Route path="/settings" element={<Settings />} />
</Route>
```

### 4.3 API Interceptors
```typescript
// Add auth header to all requests
axios.interceptors.request.use((config) => {
  const token = authStore.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

## Phase 5: Environment Configuration

### 5.1 Local Development (.env)
```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/noah_db

# JWT
JWT_SECRET=local_development_secret_key_change_in_production
JWT_REFRESH_SECRET=local_development_refresh_secret_key
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Admin credentials (for initial setup)
ADMIN_EMAIL=admin@visitdetroit.com
ADMIN_PASSWORD=VisitDetroit2024!

# Debug mode
ENABLE_DEBUG_LOGIN=true
DEBUG_EMAIL=debug@test.com
DEBUG_PASSWORD=debug123
```

### 5.2 Production (Railway)
```env
DATABASE_URL=${RAILWAY_DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
ENABLE_DEBUG_LOGIN=false
```

### 5.3 Production (Vercel)
```env
DATABASE_URL=${DATABASE_URL}
VITE_API_URL=https://noah-api.railway.app/api
```

## Phase 6: Security Measures

### 6.1 Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character

### 6.2 Rate Limiting
```javascript
// Login attempts: 5 per minute
// Token refresh: 10 per hour
// API requests: 100 per minute (authenticated)
```

### 6.3 Session Management
- Invalidate all sessions on password change
- Track active sessions per user
- Automatic session cleanup after expiry

## Phase 7: Deployment Preparation

### 7.1 Database Migrations
```bash
# Generate migration
npx prisma migrate dev --name add_auth_tables

# Deploy to production
npx prisma migrate deploy
```

### 7.2 Railway Setup
- PostgreSQL addon configured
- Environment variables set
- Automatic deployments from GitHub

### 7.3 Vercel Setup
- Frontend only deployment
- Environment variables for API URL
- Automatic deployments from GitHub

## Phase 8: Testing Plan

### 8.1 Local Testing
1. Run database migrations
2. Seed initial data
3. Test login flow
4. Verify JWT tokens
5. Test protected routes
6. Test organization scoping

### 8.2 Production Testing
1. Deploy to Railway (API + DB)
2. Deploy to Vercel (Frontend)
3. Test cross-origin authentication
4. Verify B2 storage access
5. Test session persistence

## Implementation Checklist

- [ ] Update Prisma schema with auth models
- [ ] Run database migrations
- [ ] Create auth service with JWT
- [ ] Implement auth API endpoints
- [ ] Create seed script for initial data
- [ ] Update frontend auth store
- [ ] Add protected route wrapper
- [ ] Implement login/logout UI
- [ ] Add auth headers to API calls
- [ ] Test locally with real login
- [ ] Configure Railway environment
- [ ] Configure Vercel environment
- [ ] Deploy and test in production

## Quick Start Commands

```bash
# Local setup
npm run db:migrate
npm run db:seed
npm run dev

# Production deployment
git add .
git commit -m "feat: Add authentication system"
git push origin main

# Railway will auto-deploy
# Vercel will auto-deploy
```

## Test Credentials

### Admin User (Production)
- Email: admin@visitdetroit.com
- Password: VisitDetroit2024!
- Role: ADMIN
- Organization: Visit Detroit

### Debug User (Development Only)
- Email: debug@test.com
- Password: debug123
- Role: ADMIN
- Organization: Visit Detroit

## Security Notes

1. **Never commit real passwords** - Use environment variables
2. **Rotate JWT secrets** in production regularly
3. **Use HTTPS** for all production deployments
4. **Enable CORS** only for trusted origins
5. **Log all authentication attempts** for security auditing

## Next Steps After Implementation

1. Add MFA/2FA support
2. Implement password reset flow
3. Add email verification
4. Create user management UI
5. Add audit logging
6. Implement role-based permissions
7. Add API key authentication for services