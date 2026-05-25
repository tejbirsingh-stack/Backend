# Noah Platform - Authentication & Cloud Storage Integration Plan

## Overview
This document outlines the implementation plan for integrating user authentication, database management, and cloud storage (Backblaze B2/S3) into the Noah media platform.

## Current State
- **Working**: Test player with local file serving
- **Issue**: Controls not visible in main app
- **Using**: Enhanced media server (port 3000) serving from local uploads folder
- **Need**: Secure, scalable cloud-based media serving with user authentication

## Phase 1: Database & Authentication Setup

### 1.1 Database Schema Updates
```prisma
// packages/@noah/db/prisma/schema.prisma additions

model UserFolder {
  id             String   @id @default(uuid())
  userId         String
  folderPath     String   // e.g., "user-123/projects/video-campaign"
  displayName    String
  parentId       String?
  permissions    Json     // {read: [], write: [], admin: []}
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  user           User     @relation(fields: [userId], references: [id])
  parent         UserFolder? @relation("FolderHierarchy", fields: [parentId], references: [id])
  children       UserFolder[] @relation("FolderHierarchy")
  media          MediaAsset[]
  
  @@index([userId, folderPath])
  @@unique([userId, folderPath])
}

model MediaAsset {
  id             String   @id @default(uuid())
  userId         String
  folderId       String?
  fileName       String
  displayName    String
  mimeType       String
  size           BigInt
  
  // Storage locations
  storageProvider String   // 'b2' | 's3' | 'local'
  bucketName     String
  objectKey      String    // Full path in bucket
  cdnUrl         String?   // Optional CDN URL
  
  // Metadata
  width          Int?
  height         Int?
  duration       Float?   // For videos
  frameRate      Float?
  codec          String?
  
  // Access control
  isPublic       Boolean  @default(false)
  shareToken     String?  @unique
  expiresAt      DateTime?
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  user           User     @relation(fields: [userId], references: [id])
  folder         UserFolder? @relation(fields: [folderId], references: [id])
  annotations    Annotation[]
  
  @@index([userId, folderId])
  @@index([shareToken])
}

model Annotation {
  id             String   @id @default(uuid())
  mediaAssetId   String
  userId         String
  timestamp      Float    // Time in seconds
  type           String   // 'comment' | 'drawing'
  content        Json     // Comment text or drawing data
  resolved       Boolean  @default(false)
  createdAt      DateTime @default(now())
  
  mediaAsset     MediaAsset @relation(fields: [mediaAssetId], references: [id])
  user           User     @relation(fields: [userId], references: [id])
  
  @@index([mediaAssetId, timestamp])
}
```

### 1.2 Authentication Flow
```typescript
// apps/api/src/services/auth.service.ts

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    organizationId: string;
    permissions: string[];
  };
  token: string;
}

// JWT payload structure
interface JWTPayload {
  userId: string;
  email: string;
  organizationId: string;
  sessionId: string;
  exp: number;
}
```

## Phase 2: Backblaze B2/S3 Integration

### 2.1 Storage Service Architecture
```typescript
// apps/api/src/services/storage.service.ts

interface StorageProvider {
  upload(file: Buffer, key: string): Promise<StorageResult>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StorageObject[]>;
}

class BackblazeB2Provider implements StorageProvider {
  private b2: B2;
  
  async upload(file: Buffer, key: string): Promise<StorageResult> {
    // Upload to B2 with user folder structure
    // Pattern: /{organizationId}/{userId}/media/{folderId}/{filename}
  }
  
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    // Generate time-limited signed URL for secure access
  }
}
```

### 2.2 Folder Structure in Cloud Storage
```
bucket-root/
├── org-{orgId}/
│   ├── user-{userId}/
│   │   ├── media/
│   │   │   ├── {folderId}/
│   │   │   │   ├── video1.mp4
│   │   │   │   ├── image1.jpg
│   │   │   │   └── thumbnails/
│   │   │   │       ├── video1_thumb.jpg
│   │   │   │       └── image1_thumb.jpg
│   │   └── temp/
│   │       └── uploads/
```

## Phase 3: Secure Media Serving API

### 3.1 API Endpoints
```typescript
// apps/api/src/routes/media.routes.ts

// List user's folders and media
GET /api/media/folders
GET /api/media/folders/:folderId
GET /api/media/assets/:assetId

// Upload with automatic user folder assignment
POST /api/media/upload
{
  folderId?: string,
  files: File[]
}

// Generate secure playback URL
GET /api/media/assets/:assetId/playback-url
Response: {
  url: string,       // Signed URL valid for 1 hour
  expires: number,   // Timestamp
  type: string       // 'video' | 'image' | 'audio'
}

// Annotations
POST /api/media/assets/:assetId/annotations
GET /api/media/assets/:assetId/annotations
DELETE /api/media/annotations/:annotationId
```

### 3.2 Media Access Control
```typescript
// Middleware for media access
async function checkMediaAccess(req, res, next) {
  const { assetId } = req.params;
  const userId = req.user.id;
  
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: assetId,
      OR: [
        { userId },                    // Owner
        { folder: { permissions: {     // Shared folder
          path: ['read'],
          array_contains: userId
        }}},
        { isPublic: true },            // Public asset
        { shareToken: req.query.token } // Share link
      ]
    }
  });
  
  if (!asset) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  req.asset = asset;
  next();
}
```

## Phase 4: Frontend Integration

### 4.1 Update Media Store
```typescript
// apps/web/src/stores/mediaStore.ts

interface MediaStore {
  // Fetch user's folders and media
  fetchUserMedia: () => Promise<void>;
  
  // Get secure playback URL
  getPlaybackUrl: (assetId: string) => Promise<string>;
  
  // Upload to user's folder
  uploadToFolder: (files: File[], folderId?: string) => Promise<void>;
}
```

### 4.2 Video Player URL Handling
```typescript
// apps/web/src/components/EnhancedProfessionalVideoPlayer.tsx

const [secureUrl, setSecureUrl] = useState<string>('');

useEffect(() => {
  if (assetId) {
    // Fetch secure URL from API
    fetchSecurePlaybackUrl(assetId).then(url => {
      setSecureUrl(url);
    });
  }
}, [assetId]);

// Use secure URL in video element
<video src={secureUrl} />
```

## Phase 5: Testing Strategy

### 5.1 Test User Setup
```sql
-- Create test users with different permissions
INSERT INTO users (email, name) VALUES 
  ('admin@test.com', 'Admin User'),
  ('user1@test.com', 'Test User 1'),
  ('user2@test.com', 'Test User 2');

-- Create test folders
INSERT INTO user_folders (user_id, folder_path, display_name) VALUES
  ('user1-id', 'projects/campaign-2024', 'Campaign 2024'),
  ('user1-id', 'projects/campaign-2024/videos', 'Videos'),
  ('user2-id', 'personal/vacation', 'Vacation Videos');
```

### 5.2 Test Scenarios
1. **Authentication**: Login, JWT validation, refresh tokens
2. **Upload**: File upload to correct user folder in B2
3. **Access Control**: User can only see their files
4. **Sharing**: Generate and validate share links
5. **Playback**: Secure URL generation and expiration
6. **Annotations**: Save/load annotations per user

## Phase 6: Migration Path

### 6.1 Local to Cloud Migration
```bash
# 1. Set up B2 bucket
b2 create-bucket noah-media-prod allPrivate

# 2. Configure environment variables
B2_KEY_ID=your_key_id
B2_APPLICATION_KEY=your_app_key
B2_BUCKET_NAME=noah-media-prod

# 3. Run migration script
npm run migrate:media-to-cloud
```

### 6.2 Environment Configuration
```env
# .env.production
DATABASE_URL=postgresql://...
JWT_SECRET=...
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=...
REDIS_URL=...
```

## Implementation Order

1. **Week 1**: Database schema, authentication middleware
2. **Week 2**: B2 integration, storage service
3. **Week 3**: Secure API endpoints, access control
4. **Week 4**: Frontend integration, testing
5. **Week 5**: Migration tools, deployment

## Security Considerations

1. **JWT Security**: Short-lived tokens (1 hour), refresh tokens in httpOnly cookies
2. **URL Security**: Signed URLs expire after 1 hour
3. **Rate Limiting**: Max 100 requests/minute per user
4. **File Validation**: Check MIME types, file sizes, scan for malware
5. **CORS**: Restrict to specific domains
6. **Audit Logging**: Track all file access and modifications

## Monitoring & Analytics

1. **Track Usage**: Storage per user, bandwidth usage
2. **Performance**: CDN hit rates, API response times  
3. **Errors**: Failed uploads, access denials
4. **Costs**: B2 storage and bandwidth costs per organization

## Next Steps

1. Fix current controls visibility issue in main app
2. Create database migrations
3. Implement authentication service
4. Set up B2 bucket and test uploads
5. Create secure media serving endpoints
6. Update frontend to use authenticated APIs
7. Test with multiple users