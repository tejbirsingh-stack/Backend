# S3/Backblaze B2 Integration Plan for Noah Media Server

## Overview
Implement dual storage support to allow the media server to pull from both local files and S3-compatible storage (AWS S3, Backblaze B2, MinIO).

## Architecture Design

### Storage Tiers
1. **Local Storage** (Tier 1 - Hot)
   - Recently uploaded files
   - Frequently accessed content
   - Temporary processing cache
   - Path: `/uploads/` or `/apps/api/uploads/`

2. **Cloud Storage** (Tier 2 - Warm/Cold)
   - Archived content
   - Large media libraries
   - Production assets
   - Backblaze B2 or AWS S3 buckets

### Storage Strategy
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Upload    │────▶│ Local Cache  │────▶│  S3/B2      │
│             │     │  (Hot Tier)  │     │ (Cold Tier) │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────────────────────┐
                    │    Media Server API          │
                    │  (Unified Access Layer)      │
                    └──────────────────────────────┘
```

## Implementation Steps

### Phase 1: Storage Service Layer
Create a unified storage service that abstracts storage operations:

```typescript
// packages/@noah/storage/index.ts
interface StorageProvider {
  get(key: string): Promise<Buffer | Stream>;
  put(key: string, data: Buffer | Stream): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string, expires?: number): Promise<string>;
  list(prefix?: string): Promise<StorageObject[]>;
}

class UnifiedStorageService {
  private providers: Map<string, StorageProvider>;
  
  async getAsset(assetId: string): Promise<AssetData> {
    // Check metadata for storage location
    // Route to appropriate provider
    // Return unified response
  }
}
```

### Phase 2: S3/B2 Provider Implementation

#### Required NPM Packages
```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x",
    "@aws-sdk/s3-request-presigner": "^3.x",
    "backblaze-b2": "^1.x",
    "mime-types": "^2.x"
  }
}
```

#### S3 Provider
```typescript
// apps/api/src/services/s3-storage.service.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

class S3StorageProvider implements StorageProvider {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint, // For B2/MinIO compatibility
    });
    this.bucket = config.bucket;
  }

  async getUrl(key: string, expires = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expires });
  }
}
```

### Phase 3: Enhanced Media Server API

#### Updated Media Routes
```javascript
// apps/api/src/enhanced-media-server.cjs
const { UnifiedStorageService } = require('./services/unified-storage');

// GET /api/media/assets
app.get('/api/media/assets', async (req, res) => {
  const { source = 'all' } = req.query; // 'local', 's3', 'all'
  
  const assets = await storageService.listAssets({
    source,
    includePresignedUrls: true,
    urlExpiry: 3600
  });
  
  res.json({ success: true, assets });
});

// GET /api/media/stream/:assetId
app.get('/api/media/stream/:assetId', async (req, res) => {
  const asset = await storageService.getAsset(req.params.assetId);
  
  if (asset.location === 'cloud') {
    // Redirect to presigned URL
    const url = await storageService.getPresignedUrl(asset.key);
    res.redirect(url);
  } else {
    // Stream from local storage
    const stream = await storageService.getStream(asset.key);
    stream.pipe(res);
  }
});
```

### Phase 4: Database Schema Updates

```prisma
// packages/@noah/db/prisma/schema.prisma
model MediaAsset {
  id              String    @id @default(uuid())
  name            String
  storageLocation StorageLocation @default(LOCAL)
  storageKey      String    // S3 key or local path
  bucketName      String?   // S3 bucket name
  cloudProvider   CloudProvider? // AWS, BACKBLAZE, etc.
  localPath       String?   // Fallback local path
  cdnUrl          String?   // CloudFront/CDN URL
  // ... existing fields
}

enum StorageLocation {
  LOCAL
  CLOUD
  HYBRID // Both local cache and cloud
}

enum CloudProvider {
  AWS_S3
  BACKBLAZE_B2
  MINIO
  AZURE_BLOB
}
```

### Phase 5: Environment Configuration

```env
# .env.production
# S3 Configuration (AWS)
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_REGION=us-east-1
S3_BUCKET=noah-media-assets

# Backblaze B2 Configuration
B2_APPLICATION_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_key
B2_BUCKET_NAME=noah-media-b2
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com

# Storage Configuration
STORAGE_MODE=hybrid # local, cloud, hybrid
STORAGE_CACHE_TTL=86400 # 24 hours
STORAGE_MAX_LOCAL_SIZE=10GB
```

### Phase 6: Migration Strategy

1. **Gradual Migration**
   ```typescript
   class StorageMigrationService {
     async migrateToCloud(assetId: string) {
       // 1. Upload to S3/B2
       // 2. Verify upload
       // 3. Update database
       // 4. Optionally delete local copy
     }
   }
   ```

2. **Lifecycle Policies**
   - Move files to cloud after 30 days
   - Keep thumbnails local
   - Cache frequently accessed files

### Phase 7: Frontend Updates

```typescript
// apps/web/src/stores/mediaStore.ts
interface Asset {
  id: string;
  name: string;
  url: string; // Now can be presigned S3 URL
  storageLocation: 'local' | 'cloud';
  needsAuth?: boolean; // For private S3 buckets
}

// Handle different URL types
const getAssetUrl = (asset: Asset) => {
  if (asset.storageLocation === 'cloud') {
    // URL is already presigned from API
    return asset.url;
  }
  return `/api/media/stream/${asset.id}`;
};
```

## Benefits

1. **Scalability**: Unlimited storage with S3/B2
2. **Cost Optimization**: Hot/cold tier storage
3. **Performance**: CDN integration for global delivery
4. **Reliability**: Cloud provider redundancy
5. **Flexibility**: Support multiple storage backends

## Testing Plan

### Unit Tests
- Storage provider interface compliance
- URL signing and expiration
- Error handling and retries

### Integration Tests
- Upload to S3/B2
- Stream from cloud storage
- Fallback to local storage
- Migration between tiers

### Performance Tests
- Concurrent access patterns
- Large file streaming
- Presigned URL generation speed

## Security Considerations

1. **Access Control**
   - Use IAM roles for production
   - Implement bucket policies
   - Enable S3 server-side encryption

2. **URL Security**
   - Short-lived presigned URLs
   - IP restrictions if needed
   - CloudFront signed cookies for CDN

3. **Data Protection**
   - Enable versioning on S3 buckets
   - Set up lifecycle rules
   - Configure cross-region replication

## Rollout Timeline

### Week 1: Foundation
- [ ] Implement StorageProvider interface
- [ ] Create S3StorageProvider
- [ ] Add Backblaze B2 support

### Week 2: Integration
- [ ] Update media server endpoints
- [ ] Database schema migration
- [ ] Add storage service to API

### Week 3: Testing & Migration
- [ ] Write comprehensive tests
- [ ] Test with production data
- [ ] Create migration scripts

### Week 4: Deployment
- [ ] Deploy to staging environment
- [ ] Monitor performance
- [ ] Production rollout

## Cost Estimation

### Backblaze B2 (Recommended for cost)
- Storage: $0.006/GB/month
- Download: $0.01/GB
- API calls: Free up to 2.5M/day

### AWS S3
- Storage: $0.023/GB/month (Standard)
- Transfer: $0.09/GB (after 1GB free)
- API calls: $0.0004 per 1000 requests

## Quick Start Implementation

For immediate testing, start with this minimal implementation:

```javascript
// Quick S3 integration for enhanced-media-server.cjs
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  region: process.env.S3_REGION,
  signatureVersion: 'v4'
});

// Add to existing /api/media endpoint
app.get('/api/media', async (req, res) => {
  const { includeS3 } = req.query;
  
  // Get local files (existing code)
  const localAssets = await getLocalAssets();
  
  if (includeS3 === 'true') {
    // List S3 objects
    const s3Assets = await s3.listObjectsV2({
      Bucket: process.env.S3_BUCKET,
      MaxKeys: 100
    }).promise();
    
    // Transform S3 objects to asset format
    const cloudAssets = s3Assets.Contents.map(obj => ({
      id: obj.Key,
      name: obj.Key.split('/').pop(),
      type: 'video', // Determine from extension
      size: obj.Size,
      url: s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET,
        Key: obj.Key,
        Expires: 3600
      }),
      storageLocation: 'cloud',
      uploadDate: obj.LastModified
    }));
    
    return res.json({
      success: true,
      assets: [...localAssets, ...cloudAssets]
    });
  }
  
  res.json({ success: true, assets: localAssets });
});
```

## Next Steps

1. Review and approve this plan
2. Set up S3/B2 bucket and credentials
3. Implement Phase 1 (Storage Service Layer)
4. Test with sample S3 bucket
5. Gradually migrate existing assets