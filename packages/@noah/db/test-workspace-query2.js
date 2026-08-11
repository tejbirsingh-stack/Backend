const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const userId = "350c047a-60a1-4a84-8bdb-79748e9a906e";
    const orgId = "350c047a-60a1-4a84-8bdb-79748e9a906e";
    const workspaces = await prisma.workspace.findMany({
      where: {
          orgId,
          OR: [
              {
                  users: {
                      some: {
                          userId: userId
                      }
                  }
              },
              {
                  groups: {
                      some: {
                          group: {
                              members: {
                                  some: {
                                      userId: userId
                                  }
                              }
                          }
                      }
                  }
              }
          ]
      }
    });
    console.log("Success");
  } catch (err) {
    console.error("Prisma error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
