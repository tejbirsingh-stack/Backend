const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        {
          groups: {
            some: {
              group: {
                members: {
                  some: {}
                }
              }
            }
          }
        }
      ]
    }
  });
  console.log("Workspaces:", workspaces.length);
}

test().catch(console.error).finally(() => prisma.$disconnect());
