# Backblaze B2 Integration Guide

## Overview
The Noah Media Server now supports dual storage with Backblaze B2 cloud storage alongside local file storage. This allows for scalable, cost-effective media storage with automatic failover between local and cloud storage.

## Features
- ✅ **Dual Storage Support**: Files can be stored locally, in B2, or both
- ✅ **Automatic Presigned URLs**: Secure, time-limited URLs for B2 files
- ✅ **Storage Source Selection**: View files from local, B2, or all sources
- ✅ **Upload Destination Control**: Choose where to upload files
- ✅ **Fallback Support**: Falls back to local storage if B2 fails

## Configuration

### 1. Set Up Backblaze B2 Account
1. Sign up at https://www.backblaze.com/b2/
2. Create a new bucket (e.g., `noah-media-prod`)
3. Create an Application Key with read/write access
4. Note down:
   - Key ID
   - Application Key
   - Bucket Name
   - Endpoint URL (e.g., `https://s3.us-west-002.backblazeb2.com`)

### 2. Configure Environment Variables

Add these to your `.env` file (local) or Railway environment variables (production):

```env
# Backblaze B2 Configuration
B2_KEY_ID=your-key-id-here
B2_APPLICATION_KEY=your-application-key-here
B2_BUCKET_NAME=your-bucket-name
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
B2_REGION=us-west-002
```

### 3. Verify Configuration

Start the server and check the logs:
```bash
cd apps/api
node src/enhanced-media-server.cjs
```

You should see:
```
☁️ B2 Storage:
  ✅ B2 Enabled
  Bucket: your-bucket-name
  Endpoint: https://s3.us-west-002.backblazeb2.com
```

## API Usage

### List Media Assets

```bash
# Get all assets (local + B2)
curl http://localhost:3000/api/media?source=all

# Get only local assets
curl http://localhost:3000/api/media?source=local

# Get only B2 assets
curl http://localhost:3000/api/media?source=b2
```

### Upload Files

```bash
# Upload to local storage only
curl -X POST http://localhost:3000/api/media/upload \
  -F "file=@video.mp4" \
  -F "destination=local"

# Upload to B2 only
curl -X POST http://localhost:3000/api/media/upload \
  -F "file=@video.mp4" \
  -F "destination=b2"

# Upload to both local and B2
curl -X POST http://localhost:3000/api/media/upload \
  -F "file=@video.mp4" \
  -F "destination=both"
```

### Check Storage Status

```bash
curl http://localhost:3000/api/storage/status
```

Response:
```json
{
  "success": true,
  "storage": {
    "local": {
      "enabled": true,
      "totalFiles": 10,
      "totalSize": 1048576,
      "formattedSize": "1 MB"
    },
    "b2": {
      "enabled": true,
      "bucket": "noah-media-prod",
      "totalFiles": 5,
      "totalSize": 5242880,
      "formattedSize": "5 MB"
    }
  }
}
```

## Web Interface

The web interface (http://localhost:3000) now includes:

1. **Storage Source Selector**: Toggle between viewing local, B2, or all files
2. **Upload Destination Options**: Choose where to upload files:
   - 📾 Local Only
   - ☁️ B2 Only
   - 🔄 Both

## Cost Optimization

### Backblaze B2 Pricing (as of 2024)
- **Storage**: $0.006/GB/month ($6/TB/month)
- **Download**: $0.01/GB
- **API Calls**: Free (first 2.5M class B, 25K class C per day)
- **Upload**: Free

### Best Practices
1. **Use "Local Only" for**:
   - Temporary files
   - Files being actively edited
   - Small frequently accessed files

2. **Use "B2 Only" for**:
   - Large archived files
   - Backup content
   - Infrequently accessed media

3. **Use "Both" for**:
   - Critical files needing redundancy
   - Content being migrated
   - High-availability requirements

## Railway Deployment

For Railway deployment, add these environment variables in your Railway service:

```env
NODE_ENV=production
B2_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-app-key
B2_BUCKET_NAME=your-bucket
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
B2_REGION=us-west-002
```

## Troubleshooting

### B2 Not Enabled
If you see "⚠️ B2 Disabled" in the logs:
- Check that all B2 environment variables are set
- Verify the Key ID and Application Key are correct
- Ensure the bucket exists and is accessible

### Upload Failures
If B2 uploads fail:
- The server will automatically fall back to local storage
- Check the console logs for specific error messages
- Verify your B2 credentials have write permissions

### Presigned URLs Not Working
- URLs expire after 1 hour by default
- Check that your system clock is synchronized
- Verify the B2 endpoint URL is correct for your region

## Security Considerations

1. **Never commit B2 credentials** to version control
2. **Use environment variables** for all sensitive configuration
3. **Presigned URLs expire** after 1 hour for security
4. **B2 buckets should be private** - access only via presigned URLs
5. **Consider encryption** for sensitive content before uploading

## Future Enhancements

Planned features for B2 integration:
- [ ] Automatic migration of old files to B2
- [ ] Lifecycle policies for automatic archival
- [ ] CDN integration for global distribution
- [ ] Multipart upload for files > 100MB
- [ ] Bandwidth usage monitoring
- [ ] Cost tracking and alerts

## Support

For issues or questions:
- Check server logs for detailed error messages
- Verify B2 dashboard for usage and permissions
- Test with the storage status endpoint
- Review Backblaze B2 S3-compatible API documentation