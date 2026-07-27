const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedTimezone() {
  console.log('🌱 Seeding timezone...');
  try {
    const existing = await prisma.systemTimezone.findFirst({
      where: { type: 'workspace' }
    });
    if (!existing) {
      await prisma.systemTimezone.create({
        data: {
          timezone: 'Europe/London',
          type: 'workspace',
          enabled: true
        }
      });
      console.log('✅ System timezone seeded with Europe/London');
    } else {
      console.log('ℹ️ System timezone already exists:', existing.timezone);
    }
  } catch (error) {
    console.error('❌ Error seeding timezone:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTimezone();
