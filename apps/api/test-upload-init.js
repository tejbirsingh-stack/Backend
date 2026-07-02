const { S3Client, CreateMultipartUploadCommand } = require('@aws-sdk/client-s3');
async function test() {
  const b2Config = {
    endpoint: process.env.B2_ENDPOINT || "https://s3.us-east-005.backblazeb2.com",
    region: process.env.B2_REGION || "us-east-005",
    credentials: {
      accessKeyId: process.env.B2_KEY_ID || "0059b85434d28360000000003",
      secretAccessKey: process.env.B2_APPLICATION_KEY || "K005/p+T2Z58w8eX5A48y5xZlBf26+Q"
    }
  };
  const s3Client = new S3Client(b2Config);
  try {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: "noah-dev-new",
      Key: "test-init-key.mp4",
      ContentType: "video/mp4"
    });
    const res = await s3Client.send(cmd);
    console.log("b2 success", res.UploadId);
  } catch (e) {
    console.log("b2 error object:", e);
  }
}
test();
