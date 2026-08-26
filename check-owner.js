import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const asset = await prisma.asset.findUnique({ where: { id: '8823a3c0-fd86-429a-922f-dc2f1492340b' } });
  console.log("Asset UploadedBy:", asset.uploadedByUserId);
  console.log("Asset OrgId:", asset.orgId);
  await prisma.$disconnect();
}
run();
