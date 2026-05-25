# Noah Platform - Authentication & Database Implementation Roadmap

## 🎯 Objective
Implement full authentication system with user management, organization structure, and file permissions.

## 📊 Current State Analysis

### ✅ What We Have:
1. **Database Schema** - Comprehensive Prisma schema with:
   - User, Organization, MediaAsset models
   - ShareLink model for external sharing
   - UserSession for authentication
   - AuditLog for tracking
   - All relationships properly defined

2. **Auth Service Structure** - Basic auth service with:
   - Password hashing (argon2)
   - MFA/TOTP support (otplib)
   - Rate limiting (rate-limiter-flexible)
   - Session management framework

3. **Frontend Auth Components**:
   - AuthPage with login/register forms
   - Auth store (Zustand)
   - MFA setup component

### ❌ What's Missing:
1. Database connection and Prisma client setup
2. Actual user registration/login implementation
3. JWT token generation and validation
4. File ownership linking
5. Permission checking middleware
6. Organization/team management UI
7. Share link generation and management

## 🚀 Implementation Steps

### Step 1: Database Setup (Day 1)
```bash
# 1. Start PostgreSQL with Docker
docker-compose up -d postgres

# 2. Create database
psql -U postgres -c "CREATE DATABASE noah_dev;"

# 3. Update .env file
DATABASE_URL="postgresql://noah_user:noah_dev_password@localhost:5432/noah_dev"

# 4. Generate Prisma client
cd packages/@noah/db
npm run db:generate

# 5. Run migrations
npm run db:migrate

# 6. Seed initial admin user
npm run db:seed
```

### Step 2: Complete Auth Service (Day 2)

#### 2.1 Update `auth.service.ts`:
```typescript
import { PrismaClient } from '@noah/db';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Complete getUserByEmail
private async getUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
    include: { organization: true }
  });
}

// Implement registration
async register(data: RegisterData) {
  const passwordHash = await argon2.hash(data.password);
  
  // Create organization if new
  const org = await prisma.organization.create({
    data: {
      name: data.organizationName,
      slug: data.organizationName.toLowerCase().replace(/\s+/g, '-'),
      planType: 'free'
    }
  });
  
  // Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      orgId: org.id,
      role: 'OWNER'
    }
  });
  
  return this.generateTokens(user);
}

// Generate JWT tokens
private async generateTokens(user: User) {
  const accessToken = jwt.sign(
    { userId: user.id, orgId: user.orgId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  // Store session
  await prisma.userSession.create({
    data: {
      userId: user.id,
      token: accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
  
  return { accessToken, refreshToken };
}
```

### Step 3: Auth Middleware (Day 2)

#### 3.1 Create `middleware/auth.ts`:
```typescript
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@noah/db';

const prisma = new PrismaClient();

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify session is still valid
    const session = await prisma.userSession.findUnique({
      where: { token },
      include: { user: true }
    });
    
    if (!session || session.revokedAt) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    req.user = session.user;
    req.orgId = decoded.orgId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

### Step 4: Update Media Endpoints (Day 3)

#### 4.1 Link uploads to users:
```typescript
// In upload endpoint
app.post('/api/media/upload', requireAuth, upload.single('file'), async (req, res) => {
  // Save to database with user link
  const asset = await prisma.mediaAsset.create({
    data: {
      fileName: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      orgId: req.orgId,
      uploadedByUserId: req.user.id,
      status: 'ready'
    }
  });
  
  res.json({ success: true, asset });
});
```

#### 4.2 Filter media by user:
```typescript
// Get user's media
app.get('/api/media', requireAuth, async (req, res) => {
  const where = req.user.role === 'ADMIN' 
    ? { orgId: req.orgId } // Admin sees all org files
    : { 
        orgId: req.orgId,
        OR: [
          { uploadedByUserId: req.user.id }, // User's files
          { shareLinks: { some: { /* shared with user */ } } } // Shared files
        ]
      };
  
  const assets = await prisma.mediaAsset.findMany({
    where,
    include: { uploadedBy: true, tags: true }
  });
  
  res.json({ success: true, assets });
});
```

### Step 5: Frontend Integration (Day 4)

#### 5.1 Update auth store:
```typescript
// stores/authStore.ts
interface AuthStore {
  user: User | null;
  token: string | null;
  
  login: async (email: string, password: string) => {
    const response = await axios.post('/api/auth/login', { email, password });
    
    if (response.data.success) {
      this.user = response.data.user;
      this.token = response.data.tokens.accessToken;
      localStorage.setItem('token', this.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  };
  
  logout: () => {
    this.user = null;
    this.token = null;
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };
}
```

#### 5.2 Protected routes:
```typescript
// App.tsx
function PrivateRoute({ children }) {
  const { user } = useAuthStore();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return children;
}

// Usage
<Route path="/media" element={
  <PrivateRoute>
    <MediaBrowser />
  </PrivateRoute>
} />
```

### Step 6: Share Links (Day 5)

#### 6.1 Generate share link:
```typescript
app.post('/api/media/:id/share', requireAuth, async (req, res) => {
  const { permissions, expiresIn, password } = req.body;
  
  const shareLink = await prisma.shareLink.create({
    data: {
      assetId: req.params.id,
      orgId: req.orgId,
      token: generateSecureToken(),
      passwordHash: password ? await argon2.hash(password) : null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : null,
      permissions,
      createdById: req.user.id
    }
  });
  
  const shareUrl = `${process.env.APP_URL}/s/${shareLink.token}`;
  res.json({ success: true, shareUrl });
});
```

#### 6.2 Access shared content:
```typescript
app.get('/api/share/:token', async (req, res) => {
  const shareLink = await prisma.shareLink.findUnique({
    where: { token: req.params.token },
    include: { asset: true }
  });
  
  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) {
    return res.status(404).json({ error: 'Invalid or expired link' });
  }
  
  // Check password if required
  if (shareLink.passwordHash) {
    const { password } = req.body;
    if (!password || !await argon2.verify(shareLink.passwordHash, password)) {
      return res.status(401).json({ error: 'Password required' });
    }
  }
  
  // Update access count
  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: { 
      downloadCount: { increment: 1 },
      lastAccessedAt: new Date()
    }
  });
  
  res.json({ success: true, asset: shareLink.asset });
});
```

## 📅 Timeline

### Week 1 (Days 1-5):
- ✅ Day 1: Database setup and connection
- ✅ Day 2: Complete auth service and middleware
- ✅ Day 3: Update media endpoints with permissions
- ✅ Day 4: Frontend auth integration
- ✅ Day 5: Share link implementation

### Week 2 (Days 6-10):
- Day 6: Organization management UI
- Day 7: Team invitation system
- Day 8: Permission management UI
- Day 9: Share link management UI
- Day 10: Testing and bug fixes

## 🧪 Testing Checklist

### Authentication:
- [ ] User can register with email/password
- [ ] User can login
- [ ] JWT tokens are properly generated
- [ ] Sessions expire correctly
- [ ] Refresh tokens work

### Permissions:
- [ ] Users only see their own files
- [ ] Admins see all organization files
- [ ] Shared files appear for recipients
- [ ] Public share links work
- [ ] Password-protected shares work

### Organization:
- [ ] Organization is created on first user registration
- [ ] Team members can be invited
- [ ] Roles are properly enforced
- [ ] Organization storage quota is tracked

## 🔑 Environment Variables Needed

```env
# Database
DATABASE_URL=postgresql://noah_user:noah_dev_password@localhost:5432/noah_dev

# JWT
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Redis (for sessions)
REDIS_URL=redis://localhost:6379

# App
APP_URL=http://localhost:3002
API_URL=http://localhost:3000
```

## 🎯 Success Criteria

1. **Users can:**
   - Register and login
   - Upload files that are tied to their account
   - Only see their own files
   - Share files with others via links

2. **Admins can:**
   - See all files in the organization
   - Manage users and permissions
   - Monitor usage and activity

3. **System:**
   - Properly authenticates all requests
   - Enforces permissions consistently
   - Tracks all actions in audit log
   - Handles errors gracefully

## Next Immediate Actions:

1. **Start PostgreSQL database**
2. **Run Prisma migrations**
3. **Complete auth service implementation**
4. **Test registration and login**
5. **Update media endpoints with auth**

This roadmap provides a clear path from our current state (30% complete) to a fully authenticated system (50% complete).