const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../apps/api/.env') });

// Import Prisma from the generated client location
const { PrismaClient } = require(path.join(__dirname, '../packages/@noah/db/node_modules/@prisma/client'));

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔄 Creating Visit Detroit organization and admin user...');
    
    // Create or update Visit Detroit organization
    const org = await prisma.organization.upsert({
      where: { slug: 'visit-detroit' },
      update: {
        name: 'Visit Detroit',
        planType: 'enterprise',
        storageQuotaBytes: BigInt(10 * 1024 * 1024 * 1024 * 1024), // 10TB
        features: {
          b2Storage: true,
          autoCompress: true,
          aiTagging: false,
          unlimitedUsers: true
        },
        metadata: {
          description: "Detroit's official convention and visitors bureau",
          b2BucketPrefix: "visit-detroit/"
        }
      },
      create: {
        name: 'Visit Detroit',
        slug: 'visit-detroit',
        planType: 'enterprise',
        storageQuotaBytes: BigInt(10 * 1024 * 1024 * 1024 * 1024), // 10TB
        features: {
          b2Storage: true,
          autoCompress: true,
          aiTagging: false,
          unlimitedUsers: true
        },
        metadata: {
          description: "Detroit's official convention and visitors bureau",
          b2BucketPrefix: "visit-detroit/"
        }
      }
    });
    
    console.log('✅ Organization created/updated:', org.name);
    
    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@visitdetroit.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'VisitDetroit2024!';
    
    // Check if admin user already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });
    
    if (existingAdmin) {
      console.log('ℹ️ Admin user already exists:', adminEmail);
      console.log('   Updating password...');
      
      await prisma.user.update({
        where: { email: adminEmail },
        data: {
          passwordHash: await bcrypt.hash(adminPassword, 10),
          status: 'active',
          failedLoginAttempts: 0,
          lockoutUntil: null
        }
      });
      
      console.log('✅ Admin password updated');
    } else {
      const adminUser = await prisma.user.create({
        data: {
          orgId: org.id,
          email: adminEmail,
          name: 'Admin User',
          passwordHash: await bcrypt.hash(adminPassword, 10),
          role: 'admin',
          status: 'active'
        }
      });
      
      console.log('✅ Admin user created:', adminUser.email);
    }
    
    console.log('\n📝 Admin Login Credentials:');
    console.log('   Email:', adminEmail);
    console.log('   Password:', adminPassword);
    
    // Create debug user if enabled
    if (process.env.ENABLE_DEBUG_LOGIN === 'true') {
      const debugEmail = process.env.DEBUG_EMAIL || 'debug@test.com';
      const debugPassword = process.env.DEBUG_PASSWORD || 'debug123';
      
      const existingDebug = await prisma.user.findUnique({
        where: { email: debugEmail }
      });
      
      if (existingDebug) {
        console.log('\nℹ️ Debug user already exists:', debugEmail);
        await prisma.user.update({
          where: { email: debugEmail },
          data: {
            passwordHash: await bcrypt.hash(debugPassword, 10),
            status: 'active',
            failedLoginAttempts: 0,
            lockoutUntil: null
          }
        });
        console.log('✅ Debug password updated');
      } else {
        const debugUser = await prisma.user.create({
          data: {
            orgId: org.id,
            email: debugEmail,
            name: 'Debug User',
            passwordHash: await bcrypt.hash(debugPassword, 10),
            role: 'admin',
            status: 'active'
          }
        });
        
        console.log('\n✅ Debug user created:', debugUser.email);
      }
      
      console.log('\n📝 Debug Login Credentials:');
      console.log('   Email:', debugEmail);
      console.log('   Password:', debugPassword);
    }
    
    console.log('\n✨ Setup complete! You can now login with the credentials above.');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createAdminUser();