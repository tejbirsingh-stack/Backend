const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const p = await prisma.project.findUnique({
        where: { id: "c9b35d99-a7c2-401a-98e8-dff1f8161bf1" }
    });
    console.log("PROJECT:", p);
}

main().finally(() => prisma.$disconnect());
