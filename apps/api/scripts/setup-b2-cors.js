const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function setCors() {
  console.log("Configuring CORS for Backblaze B2 Bucket...");
  
  const s3Client = new S3Client({
    region: process.env.B2_REGION || 'us-east-005',
    endpoint: process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APPLICATION_KEY,
    },
    forcePathStyle: true,
  });

  const bucketName = process.env.B2_BUCKET_NAME;

  if (!bucketName) {
    console.error("❌ B2_BUCKET_NAME is not set in your .env file!");
    return;
  }

  const command = new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
          AllowedOrigins: ["*"], // Allows any domain to upload (e.g., localhost:3002)
          ExposeHeaders: ["ETag"], // Crucial for multipart uploads to work!
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  try {
    await s3Client.send(command);
    console.log(`✅ CORS rules successfully applied to bucket: ${bucketName}`);
    console.log(`Your frontend should now be able to upload directly without Cross-Origin errors.`);
  } catch (error) {
    console.error(`❌ Failed to update CORS:`, error.message);
  }
}

setCors();
