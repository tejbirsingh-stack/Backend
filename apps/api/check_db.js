const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

BigInt.prototype.toJSON = function() { return this.toString() }

async function check() {
  const assets = await prisma.asset.findMany({ include: { files: true, metadata: true, transcodeJobs: true } });
  console.log(JSON.stringify(assets, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
