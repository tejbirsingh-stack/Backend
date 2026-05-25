# Backblaze B2 Lifecycle Rules for Cost Optimization

## Overview
Lifecycle rules help optimize storage costs by automatically managing file versions, moving files to cheaper storage classes, and deleting old files. This guide provides recommended lifecycle rules for the Noah media platform.

## Cost Structure (as of 2024)
- **B2 Storage**: $0.005/GB/month
- **B2 Download**: $0.01/GB (free with Cloudflare)
- **B2 Transactions**: Free up to daily limits
- **Archive Storage**: Coming soon (even cheaper for cold storage)

## Recommended Lifecycle Rules

### 1. Version Management
Limit the number of file versions to prevent storage bloat.

**Configuration:**
- **Rule Name**: `limit-versions`
- **Applies to**: All files
- **Action**: Keep only the last 3 versions of each file
- **Days to keep old versions**: 30 days

**B2 Console Settings:**
```json
{
  "fileNamePrefix": "",
  "daysFromHidingToDeleting": 30,
  "daysFromUploadingToHiding": null
}
```

**Cost Impact**: Can reduce storage by 50-70% for frequently updated files

### 2. Temporary Upload Cleanup
Delete incomplete multipart uploads and temporary files.

**Configuration:**
- **Rule Name**: `cleanup-temp`
- **Applies to**: Files with prefix `temp/` or `tmp/`
- **Action**: Delete after 7 days

**B2 Console Settings:**
```json
{
  "fileNamePrefix": "temp/",
  "daysFromHidingToDeleting": 1,
  "daysFromUploadingToHiding": 7
}
```

**Cost Impact**: Prevents accumulation of orphaned upload parts

### 3. Thumbnail Lifecycle
Keep thumbnails for active media only.

**Configuration:**
- **Rule Name**: `thumbnail-cleanup`
- **Applies to**: Files with prefix `thumbnails/`
- **Action**: Delete if source media is deleted
- **Alternative**: Delete after 180 days of no access

**Cost Impact**: Thumbnails typically use 10-20% of total storage

### 4. Archive Old Media (Future)
Move rarely accessed media to archive storage when available.

**Configuration:**
- **Rule Name**: `archive-old-media`
- **Applies to**: All media files
- **Action**: Move to Archive storage after 90 days without access
- **Retrieval**: 12-hour retrieval time acceptable

**Estimated Savings**: 80% reduction for archived content

### 5. Compression Artifacts
Clean up intermediate compression files.

**Configuration:**
- **Rule Name**: `compression-cleanup`
- **Applies to**: Files with suffix `.processing` or in `processing/` folder
- **Action**: Delete after 24 hours

## Implementation Steps

### Via B2 Console:

1. **Log into B2 Console**
   - Navigate to your bucket
   - Click "Lifecycle Settings"

2. **Add Version Control Rule**
   ```
   Keep only last: 3 versions
   Delete old versions after: 30 days
   ```

3. **Add Prefix-based Rules**
   ```
   For temp files:
   - File name prefix: temp/
   - Hide after: 7 days
   - Delete after hiding: 1 day
   ```

### Via B2 CLI:

```bash
# Install B2 CLI
pip install b2

# Authorize
b2 authorize-account $B2_KEY_ID $B2_APPLICATION_KEY

# Set lifecycle rule
b2 update-bucket --lifecycleRules '[
  {
    "fileNamePrefix": "temp/",
    "daysFromHidingToDeleting": 1,
    "daysFromUploadingToHiding": 7
  }
]' NoahDemo allPrivate
```

### Via API (in code):

```javascript
const { S3Client, PutBucketLifecycleConfigurationCommand } = require('@aws-sdk/client-s3');

const lifecycleConfig = {
  Bucket: 'NoahDemo',
  LifecycleConfiguration: {
    Rules: [
      {
        ID: 'DeleteTempFiles',
        Status: 'Enabled',
        Filter: {
          Prefix: 'temp/'
        },
        Expiration: {
          Days: 7
        }
      },
      {
        ID: 'DeleteOldVersions',
        Status: 'Enabled',
        NoncurrentVersionExpiration: {
          NoncurrentDays: 30
        }
      }
    ]
  }
};

await s3Client.send(new PutBucketLifecycleConfigurationCommand(lifecycleConfig));
```

## Cost Optimization Strategies

### 1. Smart Upload Strategy
- **Immediate**: Critical files → B2 + Local
- **Delayed**: Large archives → Local first, sync to B2 during off-hours
- **Selective**: Only finals to B2, keep work-in-progress local

### 2. Intelligent Caching
- Keep hot files (accessed in last 30 days) in both locations
- Cold files (30-90 days) in B2 only
- Archive (90+ days) in B2 with local deletion

### 3. Bandwidth Optimization
- Use Cloudflare for B2 (free bandwidth)
- Enable Cloudflare caching for public assets
- Implement client-side caching headers

### 4. Storage Tiering (Recommended Thresholds)

| File Age | Access Pattern | Storage Location | Action |
|----------|---------------|------------------|---------|
| 0-7 days | Frequent | Local + B2 | Full redundancy |
| 7-30 days | Regular | Local + B2 | Consider compression |
| 30-90 days | Occasional | B2 only | Delete local copy |
| 90-180 days | Rare | B2 compressed | Heavy compression |
| 180+ days | Archive | B2 archive tier | Move to cold storage |

### 5. File Type Specific Rules

**Videos:**
- Keep original: 30 days
- Keep compressed: Indefinitely
- Delete proxies: 7 days after project completion

**Images:**
- Keep original: Indefinitely (usually small)
- Generate thumbnails on-demand
- Cache thumbnails: 30 days

**Documents:**
- Keep all versions: 90 days
- Archive after: 1 year

## Monitoring & Alerts

### Set Up Cost Alerts:
1. B2 Console → Account → Caps & Alerts
2. Set daily storage cap: e.g., 500 GB
3. Set daily bandwidth cap: e.g., 100 GB
4. Set transaction cap: e.g., 100,000 Class B

### Regular Reviews:
- **Weekly**: Check storage growth rate
- **Monthly**: Review bandwidth usage
- **Quarterly**: Audit lifecycle rule effectiveness

### Metrics to Track:
```javascript
// Add to your monitoring dashboard
const metrics = {
  totalStorage: 'GB used in B2',
  dailyBandwidth: 'GB downloaded',
  storageGrowthRate: 'GB/day',
  compressionRatio: 'Original/Compressed size',
  cacheHitRate: 'Cloudflare cache hits %',
  costPerGB: 'Total cost / Total GB'
};
```

## Example Savings Calculation

**Without Lifecycle Rules:**
- 1TB storage: $5/month
- 500GB bandwidth: $5/month
- Total: $10/month

**With Lifecycle Rules:**
- 400GB storage (60% reduction): $2/month
- 100GB bandwidth (80% reduction via CDN): $1/month
- Total: $3/month
- **Savings: 70% ($84/year)**

## Best Practices

1. **Test Rules First**
   - Use a test bucket
   - Start with non-critical files
   - Monitor for 30 days before production

2. **Document Everything**
   - Keep lifecycle rules in version control
   - Document why each rule exists
   - Track cost impact monthly

3. **Regular Audits**
   - Review rules quarterly
   - Adjust based on usage patterns
   - Remove obsolete rules

4. **Backup Considerations**
   - Lifecycle rules are permanent
   - Keep critical data in multiple locations
   - Test recovery procedures regularly

## Integration with Noah Platform

The Noah platform now includes:
- ✅ Automatic B2 sync service
- ✅ Storage source selection in UI
- ✅ Upload destination control
- ✅ Lifecycle rule recommendations

To enable lifecycle rules in production:
1. Configure rules in B2 console
2. Set `B2_LIFECYCLE_ENABLED=true` in `.env`
3. Monitor impact via `/api/storage/metrics`

## Support Resources

- [B2 Lifecycle Rules Documentation](https://www.backblaze.com/b2/docs/lifecycle_rules.html)
- [B2 Pricing Calculator](https://www.backblaze.com/b2/cloud-storage-pricing.html)
- [Cloudflare B2 Bandwidth Alliance](https://www.cloudflare.com/bandwidth-alliance/backblaze/)
- [B2 CLI Reference](https://www.backblaze.com/b2/docs/quick_command_line.html)