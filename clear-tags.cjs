require('dotenv').config({ path: 'apps/api/.env' });
const prisma = require('./apps/api/src/utils/prisma');

async function main() {
  await prisma.tag.deleteMany({});
  console.log("All tags cleared");
}

main().catch(console.error).finally(() => prisma.$disconnect());
