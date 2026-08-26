import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const notifs = await prisma.notification.findMany({ 
    where: { relatedEntityId: '8823a3c0-fd86-429a-922f-dc2f1492340b' },
    orderBy: { createdAt: 'desc' }
  });
  console.log(notifs);
  await prisma.$disconnect();
}
run();
