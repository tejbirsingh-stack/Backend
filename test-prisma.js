import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  try {
    const res = await prisma.assetGroup.findFirst({
      where: {
        assetId: '8823a3c0-fd86-429a-922f-dc2f1492340b',
        group: { members: { some: { userId: '11111111-1111-1111-1111-111111111111' } } }
      }
    });
    console.log("Query OK:", res);
  } catch (err) {
    console.error("Query Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}
run();
