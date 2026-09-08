const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: "0fd0ae6b-bd83-4086-8c38-8b642d974ecf" } });
  console.log("showCompanyWatermarkDefault:", org.showCompanyWatermarkDefault);
}

main().finally(() => prisma.$disconnect());
