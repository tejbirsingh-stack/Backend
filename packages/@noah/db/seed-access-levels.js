const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function seedAccessLevels() {
  try {
    console.log(" Seeding access levels...");

    const levels = [
      { id: '10f1fe4a-f28f-4d76-a7c2-6175dfe04c9b', name: "FULL_ACCESS", title: "Full Access", description: "Can view, edit, delete, and manage access." },
      { id: 'd321a6c5-c28a-4dc4-900e-4dc57fe276bf', name: "CAN_EDIT", title: "Can Edit", description: "Can view and edit items, but cannot manage access." },
      { id: 'eef95f55-9cf3-490a-bf4c-0af6292c191d', name: "CAN_VIEW", title: "Can View", description: "Can only view items." }
    ];

    for (const level of levels) {
      await prisma.accessLevel.upsert({
        where: { id: level.id },
        update: { name: level.name, title: level.title, description: level.description },
        create: level,
      });
      console.log(`✅ Access level created: ${level.name}`);
    }

    console.log("🎉 Access levels seeded successfully");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seedAccessLevels();
