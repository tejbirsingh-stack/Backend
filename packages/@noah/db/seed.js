const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...");

    // ===========================
    // Hash Password
    // ===========================

    const hashedPassword = await bcrypt.hash("Noah@2026!", 10);

    // ===========================
    // Create Organization
    // ===========================

    const org = await prisma.organization.upsert({
      where: { slug: "demo-org" },
      update: {},
      create: {
        name: "Demo Organization",
        slug: "demo-org",
        // planType: "professional",
        //features: {},
        metadata: {},
      },
    });

    console.log("✅ Organization created");


    // ===========================
    // Seed Roles
    // ===========================

    const roles = [
      {
        id: "350c047a-60a1-4a84-8bdb-79748e9a906e",
        name: "System Admin",
        show: 0,
      },
      {
        id: "88a6b2a1-b2f6-40d5-8b04-4abf7eb45401",
        name: "Admin",
        show: 1,
      },
      {
        id: "93cdf95e-dd2a-45b7-965d-cab2d1423784",
        name: "Editor",
        show: 1,
      },
      {
        id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15",
        name: "Super Admin",
        show: 0,
      },
      {
        id: "c3c36ad8-dc0a-464b-998b-a0847087fcd0",
        name: "Viewer",
        show: 1,
      },
      {
        id: "ffeec394-0e40-49e1-aed3-61962118d73e",
        name: "Collaborator",
        show: 1,
      },
    ];

    const roleMap = {};

    for (const role of roles) {
      const createdRole = await prisma.role.upsert({
        where: {
          name: role.name,
        },
        update: {},
        create: role,
      });

      roleMap[role.name] = createdRole;

      console.log(`✅ Role created: ${createdRole.name}`);
    }


    // ===========================
    // Create System Admin User
    // ===========================

    await prisma.user.upsert({
      where: {
        email: "systemadminnoah@yopmail.com",
      },
      update: {},
      create: {
        name: "System Admin",
        email: "systemadminnoah@yopmail.com",
        roleId: roleMap["System Admin"].id,
        orgId: org.id,
        status: "active",
        passwordHash: hashedPassword,
        emailVerified: true,
        preferences: {},
      },
    });

    console.log("✅ System Admin created");


    // ===========================
    // Create Super Admin User
    // ===========================

    await prisma.user.upsert({
      where: {
        email: "tejbir.singh@mtxeurope.com",
      },
      update: {},
      create: {
        name: "Super Admin",
        email: "tejbir.singh@mtxeurope.com",
        roleId: roleMap["Super Admin"].id,
        orgId: org.id,
        status: "active",
        passwordHash: hashedPassword,
        emailVerified: true,
        preferences: {},
      },
    });

    console.log("✅ Super Admin created");


    console.log("🎉 Database seeded successfully");

  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();