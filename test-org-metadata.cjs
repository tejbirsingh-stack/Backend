const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: "0fd0ae6b-bd83-4086-8c38-8b642d974ecf" } });
  console.log("metadata type:", typeof org.metadata);
  console.log("metadata.logoKey:", org.metadata?.logoKey);
}

main().finally(() => prisma.$disconnect());
