const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
async function test() {
  const b2Config = {
    endpoint: "https://s3.us-east-005.backblazeb2.com",
    region: "us-east-005",
    credentials: {
      accessKeyId: "0051298214c73930000000001",
      secretAccessKey: "K005Hs3DXYdBx7cg8Q1rXq5jMaEvMkc"
    }
  };
  const s3Client = new S3Client(b2Config);
  try {
    const cmd = new GetBucketCorsCommand({ Bucket: "noah-dev-new" });
    const res = await s3Client.send(cmd);
    console.log(JSON.stringify(res.CORSRules, null, 2));
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
