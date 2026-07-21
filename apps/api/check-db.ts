import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const assets = await prisma.asset.findMany({
    where: { status: 'pending_super_admin' },
    select: {
      id: true,
      title: true,
      status: true,
      orgId: true,
    }
  });
  console.log("Pending Admin Review Assets:", JSON.stringify(assets, null, 2));
}

main().finally(() => prisma.$disconnect());
