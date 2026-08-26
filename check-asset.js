import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const assetUsers = await prisma.assetUser.findMany({ where: { assetId: '8823a3c0-fd86-429a-922f-dc2f1492340b' } });
  const assetGroups = await prisma.assetGroup.findMany({ where: { assetId: '8823a3c0-fd86-429a-922f-dc2f1492340b' } });
  console.log("AssetUsers:", assetUsers);
  console.log("AssetGroups:", assetGroups);
  await prisma.$disconnect();
}
run();
