const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.assetUser.findMany({
    where: { assetId: 'e320385e-3cb3-4031-b669-fbe107ccc8f4' }
  });
  console.log(users);
}
main();
