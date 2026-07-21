import { PrismaClient } from './packages/@noah/db/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();
async function main() {
    const pendingAdmin = await prisma.asset.findMany({
        where: { status: 'pending_admin_review' },
        select: { id: true, title: true, status: true, orgId: true }
    });
    console.log("Assets pending Admin review:", pendingAdmin);

    const pendingSuper = await prisma.asset.findMany({
        where: { status: 'pending_super_admin' },
        select: { id: true, title: true, status: true, orgId: true }
    });
    console.log("Assets pending Super Admin review:", pendingSuper);
}
main().catch(console.error).finally(() => prisma.$disconnect());
