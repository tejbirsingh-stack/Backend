const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const assets = await prisma.mediaAsset.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  console.log(assets);
}
run();
