# Backblaze B2 Implementation Plan & Status

## Current Status: ⚠️ DISABLED
- **Reason**: Missing B2 configuration in environment variables
- **Server Message**: "B2 Storage Service disabled - missing configuration"
- **Local Storage**: Working ✅ (625 media assets available)

## Implementation Overview

### Phase 1: Configuration Setup ⏳

#### Required Environment Variables
Add the following to `apps/api/.env`:

```bash
# Backblaze B2 Configuration
B2_KEY_ID=your_key_id_here
B2_APPLICATION_KEY=your_application_key_here
B2_BUCKET_NAME=your_bucket_name_here
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com  # Optional, defaults to us-west-002
B2_REGION=us-west-002  # Optional, defaults to us-west-002
```

#### How to Get B2 Credentials

1. **Create B2 Account**
   - Go to https://www.backblaze.com/b2/
   - Sign up for an account (10GB free tier available)

2. **Create Application Key**
   - Log into B2 Console
   - Go to "App Keys" section
   - Click "Add a New Application Key"
   - Name: "noah-media-platform"
   - Type of Access: Choose based on needs
     - Read and Write (recommended for full functionality)
     - Read Only (for testing/viewing only)
   - Allow access to bucket: Select your bucket or "All"
   - File name prefix: Leave blank for full access
   - Save the credentials:
     - `keyID` → `B2_KEY_ID`
     - `applicationKey` → `B2_APPLICATION_KEY` (shown only once!)

3. **Create/Configure Bucket**
   - Go to "Buckets" section
   - Create new bucket or use existing
   - Bucket Name: e.g., "noah-media-assets"
   - Files in Bucket: "Private" (recommended)
   - Lifecycle Settings: Configure as needed
   - Save bucket name → `B2_BUCKET_NAME`

### Phase 2: Code Integration Status ✅

**Already Implemented:**
- ✅ B2 Storage Service class (`apps/api/src/b2-storage.cjs`)
- ✅ S3-compatible API using AWS SDK
- ✅ Presigned URL generation
- ✅ File upload/download/delete operations
- ✅ Integration in enhanced media server
- ✅ Dual storage support (local + B2)

**Key Features:**
- List files from B2
- Upload files to B2
- Generate presigned URLs for secure access
- Delete files from B2
- Sync between local and B2 storage

### Phase 3: Testing & Verification 🧪

#### Quick Test Commands

1. **Check B2 Status**
   ```bash
   curl http://localhost:3000/api/storage/status
   ```

2. **List Media (with B2)**
   ```bash
   curl http://localhost:3000/api/media?source=b2
   ```

3. **List All Media (local + B2)**
   ```bash
   curl http://localhost:3000/api/media?source=all
   ```

### Phase 4: Migration Strategy 📦

#### Option 1: Dual Storage (Recommended)
- Keep existing local files
- New uploads go to both local and B2
- Gradual migration of existing files
- Fallback to local if B2 unavailable

#### Option 2: B2 Primary
- Upload all existing files to B2
- Use B2 as primary storage
- Keep local cache for performance

#### Option 3: Hybrid
- Large files → B2
- Thumbnails → Local
- Frequently accessed → Local cache

### Current Implementation Details

#### File: `apps/api/src/b2-storage.cjs`
- **Status**: ✅ Complete
- **Features**:
  - S3-compatible client for B2
  - Automatic MIME type detection
  - UUID generation for unique filenames
  - Error handling and logging
  - Presigned URL generation (1-hour expiry)

#### File: `apps/api/src/enhanced-media-server.cjs`
- **Status**: ✅ Integrated
- **Endpoints**:
  - `GET /api/media?source=[local|b2|all]`
  - `GET /api/storage/status`
  - `POST /api/media/upload` (uploads to both local and B2 if enabled)
  - `DELETE /api/media/:filename`

### Troubleshooting Guide 🔧

#### Issue: "B2 Storage Service disabled"
**Solution**: Add B2 environment variables to `.env` file

#### Issue: "Invalid credentials"
**Solution**: 
- Verify Application Key ID and Key are correct
- Check if key has proper permissions
- Ensure bucket name matches exactly

#### Issue: "Bucket not found"
**Solution**:
- Verify bucket name in B2 console
- Check region settings match
- Ensure bucket is not deleted

#### Issue: "CORS errors"
**Solution**:
- Configure CORS rules in B2 bucket settings
- Add allowed origins for your frontend

### Security Best Practices 🔒

1. **Never commit credentials**
   - Keep `.env` in `.gitignore`
   - Use environment variables in production

2. **Use Application Keys with limited scope**
   - Create keys for specific buckets only
   - Use read-only keys where possible

3. **Implement lifecycle rules**
   - Auto-delete old files
   - Move to cheaper storage classes

4. **Monitor usage**
   - Set up alerts for bandwidth/storage
   - Regular audit of access patterns

### Performance Optimization 🚀

1. **Use CDN for public assets**
   - Cloudflare B2 bandwidth alliance (free egress)
   - Cache static assets

2. **Implement smart caching**
   - Cache presigned URLs (< 1 hour)
   - Local cache for frequently accessed files

3. **Optimize uploads**
   - Multipart uploads for large files
   - Parallel uploads for multiple files
   - Client-side compression

### Cost Optimization 💰

1. **B2 Pricing (as of 2024)**
   - Storage: $0.005/GB/month
   - Download: $0.01/GB
   - API Calls: Free up to limits
   - Free tier: 10GB storage

2. **Cost Saving Tips**
   - Use Cloudflare (free bandwidth)
   - Implement lifecycle policies
   - Compress before uploading
   - Delete unused versions

### Next Steps 📋

1. [ ] Add B2 credentials to `.env` file
2. [ ] Restart media server to load new config
3. [ ] Test B2 connection with status endpoint
4. [ ] Upload test file to verify write access
5. [ ] Test retrieval with presigned URL
6. [ ] Configure CORS if needed
7. [ ] Set up monitoring/alerts
8. [ ] Plan migration of existing files

### Support Resources 📚

- [Backblaze B2 Documentation](https://www.backblaze.com/b2/docs/)
- [S3-Compatible API Guide](https://www.backblaze.com/b2/docs/s3_compatible_api.html)
- [AWS SDK Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [B2 CLI Tool](https://www.backblaze.com/b2/docs/quick_command_line.html)

---

## Status Checker Output

Run the status checker script to verify your B2 configuration:
```bash
node apps/api/src/check-b2-status.cjs
```

This will check:
- ✅/❌ Environment variables present
- ✅/❌ B2 service initialization
- ✅/❌ Bucket accessibility
- ✅/❌ Read/Write permissions
- ✅/❌ Network connectivity