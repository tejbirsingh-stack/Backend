# CLAUDE.md - Storage Service

This folder contains the cloud storage integration service for B2, S3, and MinIO.

## Overview
Manages distributed storage across multiple providers with automatic tiering and CDN integration.

## Tech Stack
- **Node.js** with TypeScript
- **AWS SDK** - S3 compatibility
- **Backblaze B2** - Primary storage
- **MinIO Client** - Local S3 storage
- **CloudFront/Cloudflare** - CDN integration

## Storage Tiers
```
HOT: Frequently accessed (MinIO/S3)
WARM: Occasional access (B2)
COLD: Archive storage (Glacier/B2 Archive)
```

## Key Features
- Multi-provider support
- Automatic tiering based on access patterns
- CDN integration for global delivery
- Bandwidth optimization
- Redundancy and backup
- Presigned URLs for secure access
- Multipart upload for large files

## API Endpoints
- `POST /upload` - Upload file with resumable support
- `GET /download/:key` - Generate presigned download URL
- `DELETE /delete/:key` - Remove file from storage
- `POST /move` - Move between storage tiers
- `GET /stats` - Storage usage statistics
- `POST /optimize` - Trigger storage optimization

## Configuration
```env
# B2 Configuration
B2_KEY_ID=your_key_id
B2_APPLICATION_KEY=your_app_key
B2_BUCKET_NAME=noah-media
B2_ENDPOINT=https://s3.us-west-000.backblazeb2.com

# S3/MinIO Configuration
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=noah-assets
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1

# CDN Configuration
CDN_ENABLED=true
CDN_URL=https://cdn.noahplatform.com
CLOUDFLARE_ZONE_ID=your_zone_id
```

## Storage Strategy

### Upload Flow
1. Upload to hot tier (MinIO)
2. Process and create thumbnails
3. Sync to B2 for backup
4. Serve through CDN

### Access Pattern Analysis
```typescript
// Automatic tiering after 30 days
if (daysSinceLastAccess > 30) {
  await moveToWarmStorage(fileKey);
}

// Archive after 90 days
if (daysSinceLastAccess > 90) {
  await moveToArchive(fileKey);
}
```

## Running
```bash
# Development
npm run dev

# Production with PM2
pm2 start ecosystem.config.js

# Docker
docker build -t noah-storage .
docker run -p 4004:4004 noah-storage
```

## Integration Examples

### Upload Large File
```typescript
const uploader = new MultipartUploader({
  bucket: 'noah-media',
  key: 'videos/large-file.mp4'
});

await uploader.upload(fileStream, {
  partSize: 5 * 1024 * 1024, // 5MB parts
  onProgress: (progress) => console.log(progress)
});
```

### Generate CDN URL
```typescript
const cdnUrl = await storage.getCDNUrl(fileKey, {
  expires: 3600, // 1 hour
  transform: {
    width: 1920,
    quality: 85
  }
});
```

## Cost Optimization
- Lifecycle policies for automatic archival
- Bandwidth monitoring and alerts
- Compression before storage
- Intelligent caching strategies
- Regular cleanup of orphaned files

## Backup Strategy
- Real-time sync to B2
- Daily snapshots
- Cross-region replication
- Point-in-time recovery