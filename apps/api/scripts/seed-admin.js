/**
 * Database Admin User Seed Script
 *
 * This script creates the initial admin user and organization for Visit Detroit.
 * Run this script after setting up your database to create the first admin user.
 *
 * Usage:
 *   node scripts/seed-admin.js
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *   ADMIN_EMAIL - Admin user email (default: admin@visitdetroit.com)
 *   ADMIN_PASSWORD - Admin user password (default: VisitDetroit2024!)
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require('dotenv').config();

const prisma = new PrismaClient();

async function seedAdmin() {
  console.log('🌱 Starting admin user seed...\n');

  // Check environment
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required!');
    console.log('   Set it in your .env file or as an environment variable.');
    process.exit(1);
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@visitdetroit.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'VisitDetroit2024!';

  console.log('📧 Admin Email:', adminEmail);
  console.log('🔑 Admin Password:', adminPassword);
  console.log('');

  try {
    // Test database connection
    console.log('🔗 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!\n');

    // Check if admin user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (existingUser) {
      console.log('⚠️  Admin user already exists with email:', adminEmail);
      console.log('   If you forgot the password, you can update it manually.');

      // Update the password if needed
      const updatePassword = process.env.FORCE_PASSWORD_UPDATE === 'true';
      if (updatePassword) {
        console.log('🔄 Updating password (FORCE_PASSWORD_UPDATE=true)...');
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.user.update({
          where: { email: adminEmail },
          data: {
            passwordHash: hashedPassword,
            failedLoginAttempts: 0,
            lockoutUntil: null
          }
        });
        console.log('✅ Password updated successfully!');
      }

      return;
    }

    // Create Visit Detroit organization
    console.log('🏢 Creating Visit Detroit organization...');
    const org = await prisma.organization.upsert({
      where: { slug: 'visit-detroit' },
      update: {
        name: 'Visit Detroit',
      },
      create: {
        name: 'Visit Detroit',
        slug: 'visit-detroit',
        metadata: {
          description: "Detroit's official convention and visitors bureau",
          b2BucketPrefix: "visit-detroit/"
        }
      }
    });
    console.log('✅ Organization created:', org.name);  

    // Hash the password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    console.log('👤 Creating admin user...');
    const adminUser = await prisma.user.create({
      data: {
        orgId: org.id,
        email: adminEmail,
        name: 'Admin User',
        passwordHash: hashedPassword,
        status: 'active',
        emailVerified: true,
        failedLoginAttempts: 0
      }
    });
    console.log('✅ Admin user created:', adminUser.email);

    // Create debug user if enabled
    if (process.env.ENABLE_DEBUG_LOGIN === 'true') {
      const debugEmail = process.env.DEBUG_EMAIL || 'debug@test.com';
      const debugPassword = process.env.DEBUG_PASSWORD || 'debug123';

      console.log('\n🐛 Creating debug user...');
      console.log('📧 Debug Email:', debugEmail);
      console.log('🔑 Debug Password:', debugPassword);

      const debugHashedPassword = await bcrypt.hash(debugPassword, 10);

      const debugUser = await prisma.user.create({
        data: {
          orgId: org.id,
          email: debugEmail,
          name: 'Debug User',
          passwordHash: debugHashedPassword,
          status: 'active',
          emailVerified: true,
          failedLoginAttempts: 0
        }
      });
      console.log('✅ Debug user created:', debugUser.email);
    }

    // Summary
    console.log('\n🎉 Success! Database seeded with admin user.');
    console.log('');
    console.log('You can now login with:');
    console.log('  Email:', adminEmail);
    console.log('  Password:', adminPassword);

    if (process.env.ENABLE_DEBUG_LOGIN === 'true') {
      console.log('');
      console.log('Debug user also available:');
      console.log('  Email:', process.env.DEBUG_EMAIL || 'debug@test.com');
      console.log('  Password:', process.env.DEBUG_PASSWORD || 'debug123');
    }

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    console.error('');
    console.error('Common issues:');
    console.error('1. Database not running or not accessible');
    console.error('2. DATABASE_URL is incorrect');
    console.error('3. Database migrations not run (run: npm run db:migrate)');
    console.error('4. Missing required fields in schema');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed
seedAdmin().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});