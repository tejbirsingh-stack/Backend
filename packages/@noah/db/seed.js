const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...");

    // Create demo organization
    const org = await prisma.organization.upsert({
      where: { slug: "demo-org" },
      update: {},
      create: {
        name: "Demo Organization",
        slug: "demo-org",
        planType: "professional",
        features: {},
        metadata: {},
      },
    });

    console.log("✅ Created organization:", org.name);

    // Create demo user
    const user = await prisma.user.upsert({
      where: { email: "demo@example.com" },
      update: {},
      create: {
        name: "Demo User",
        email: "demo@example.com",
        role: "admin",
        orgId: org.id,
        preferences: {},
        status: "active",
      },
    });

    console.log("✅ Created user:", user.name);

    // Create some sample media assets
    const sampleAssets = [
      {
        fileName: "brand-campaign-video.mp4",
        filePath: "uploads/brand-campaign-video.mp4",
        fileSize: BigInt(47398000), // ~45MB
        originalSize: BigInt(47398000),
        mimeType: "video/mp4",
        fileExtension: "mp4",
        status: "ready",
        orgId: org.id,
        uploadedByUserId: user.id,
        metadata: {
          tags: ["brand", "campaign", "marketing"],
          duration: 154, // 2:34
        },
      },
      {
        fileName: "product-photos.zip",
        filePath: "uploads/product-photos.zip",
        fileSize: BigInt(13421773), // ~12.8MB
        originalSize: BigInt(13421773),
        mimeType: "application/zip",
        fileExtension: "zip",
        status: "ready",
        orgId: org.id,
        uploadedByUserId: user.id,
        metadata: {
          tags: ["product", "photography", "ecommerce"],
        },
      },
      {
        fileName: "podcast-episode-15.mp3",
        filePath: "uploads/podcast-episode-15.mp3",
        fileSize: BigInt(93889741), // ~89.5MB
        originalSize: BigInt(93889741),
        mimeType: "audio/mp3",
        fileExtension: "mp3",
        status: "ready",
        orgId: org.id,
        uploadedByUserId: user.id,
        metadata: {
          tags: ["podcast", "interview", "tech"],
          duration: 6322, // 1:45:22
        },
      },
    ];

    for (const asset of sampleAssets) {
      const createdAsset = await prisma.mediaAsset.create({
        data: asset,
      });
      console.log("✅ Created media asset:", createdAsset.fileName);
    }

    console.log("🎉 Database seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
if (require.main === module) {
  seedDatabase().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { seedDatabase };
