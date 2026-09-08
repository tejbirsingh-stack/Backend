const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const B2StorageService = require("./apps/api/src/b2-storage.cjs");
const { getB2Storage } = require("./apps/api/src/services/b2Config.js");

async function b2() { return getB2Storage(B2StorageService); }

async function main() {
  const orgId = "0fd0ae6b-bd83-4086-8c38-8b642d974ecf";
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const metadata = typeof org.metadata === 'string' ? JSON.parse(org.metadata) : org.metadata;
  const logoKey = metadata?.logoKey;
  console.log("Logo Key:", logoKey);
  
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const command = new GetObjectCommand({
    Bucket: (await b2()).bucket,
    Key: logoKey,
  });
  
  try {
    const s3Response = await (await b2()).s3Client.send(command);
    console.log("Success! ContentLength:", s3Response.ContentLength);
  } catch (err) {
    console.error("Error fetching from S3:", err.message);
  }
}

main().finally(() => prisma.$disconnect());
