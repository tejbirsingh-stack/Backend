import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Visit Detroit organization...');

  // Helper function to hash passwords
  const hash = (password: string) => bcrypt.hashSync(password, 10);

  try {
    // 1. Create Visit Detroit Organization
    const visitDetroit = await prisma.organization.upsert({
      where: { slug: 'visit-detroit' },
      update: {},
      create: {
        name: 'Visit Detroit',
        slug: 'visit-detroit',
        planType: 'pro',
        storageQuotaBytes: BigInt(107374182400), // 100GB
        storageUsedBytes: BigInt(0),
        maxUsers: 50,
        features: {
          unlimitedUsers: true,
          advancedAnalytics: true,
          customBranding: true,
          apiAccess: true,
          prioritySupport: true
        },
        metadata: {
          domain: 'visitdetroit.com',
          brandColors: {
            primary: '#004B87',
            secondary: '#C8102E'
          },
          allowPublicSharing: true,
          requireMfa: false,
          defaultVideoQuality: '1080p',
          allowExternalSharing: true
        }
      }
    });

    console.log('✅ Organization created:', visitDetroit.name);

    // 2. Create Users for Visit Detroit
    const users = [
      {
        email: 'admin@visitdetroit.com',
        name: 'Admin User',
        password: 'VisitDetroit2025!',
        role: 'system_admin'
      },
      {
        email: 'john.smith@visitdetroit.com',
        name: 'John Smith',
        password: 'Detroit2025!',
        role: 'admin'
      },
      {
        email: 'sarah.johnson@visitdetroit.com',
        name: 'Sarah Johnson',
        password: 'Detroit2025!',
        role: 'member'
      },
      {
        email: 'mike.wilson@visitdetroit.com',
        name: 'Mike Wilson',
        password: 'Detroit2025!',
        role: 'member'
      }
    ];

    for (const userData of users) {
      const user = await prisma.user.upsert({
        where: { email: userData.email },
        update: {},
        create: {
          orgId: visitDetroit.id,
          email: userData.email,
          name: userData.name,
          passwordHash: hash(userData.password),
          role: userData.role,
          preferences: {
            theme: 'light',
            notifications: true
          }
        }
      });
      console.log(`✅ User created: ${user.name} (${user.email})`);
    }

    // Media assets and collections can be created later through the app

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Test Accounts:');
    console.log('  System Admin: admin@visitdetroit.com / VisitDetroit2025!');
    console.log('  Org Admin: john.smith@visitdetroit.com / Detroit2025!');
    console.log('  Team Member: sarah.johnson@visitdetroit.com / Detroit2025!');
    console.log('  Team Member: mike.wilson@visitdetroit.com / Detroit2025!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });