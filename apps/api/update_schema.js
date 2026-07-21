const fs = require('fs');

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// 1. Remove the entire MediaAsset model
schema = schema.replace(/model MediaAsset \{[\s\S]*?\n\}\n/g, '');

// 2. Replace Organization's mediaAssets line
schema = schema.replace(/  mediaAssets  MediaAsset\[\]\n/g, '');

// 3. Replace User's uploadedMediaAssets line
schema = schema.replace(/  uploadedMediaAssets MediaAsset\[\] @relation\("UploadedBy"\)/g, '  uploadedAssets Asset[] @relation("UploadedBy")');

// 4. Update Asset to include uploadedBy
schema = schema.replace(/  transcodeJobs     TranscodeJob\[\]/g, '  transcodeJobs     TranscodeJob[]\n\n  uploadedByUserId  String?      @db.Uuid\n  uploadedBy        User?        @relation("UploadedBy", fields: [uploadedByUserId], references: [id])\n\n  annotations  Annotation[]\n  collectionAssets CollectionAsset[]\n  assetVersions    AssetVersion[]\n  assetTags        AssetTag[]\n  shareLinks       ShareLink[]\n  analyticsEvents  AnalyticsEvent[]\n  thumbnailForCollections Collection[] @relation("ThumbnailAsset")');

// 5. Replace references to MediaAsset in other models
schema = schema.replace(/MediaAsset/g, 'Asset');

fs.writeFileSync('prisma/schema.prisma', schema);
console.log('Schema updated successfully!');
