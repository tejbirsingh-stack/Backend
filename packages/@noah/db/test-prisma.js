const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    await prisma.assetTag.deleteMany({
        where: {
            assetId: '123e4567-e89b-12d3-a456-426614174000',
            tag: {
                scope: 'project'
            }
        }
    });
}
main().catch(e => console.error(e));
