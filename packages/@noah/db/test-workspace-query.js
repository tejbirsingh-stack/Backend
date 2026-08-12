const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const userId = "some-user-id";
    const orgId = "some-org-id";
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
