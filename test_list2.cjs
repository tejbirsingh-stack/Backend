const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const f = await prisma.folder.findFirst();
  console.log("Folder object:", f);
}
run().catch(console.error).finally(() => prisma.$disconnect());
