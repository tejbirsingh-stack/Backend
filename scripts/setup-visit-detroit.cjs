#!/usr/bin/env node

// Setup script for Visit Detroit organization and users
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function setupVisitDetroit() {
  try {
    console.log('🏢 Setting up Visit Detroit organization...');
    
    // Create Visit Detroit organization
    const organization = await prisma.organization.upsert({
      where: { slug: 'visit-detroit' },
      update: {},
      create: {
        name: 'Visit Detroit',
        slug: 'visit-detroit',
        planType: 'enterprise',
        storageQuotaBytes: BigInt(10 * 1024 * 1024 * 1024 * 1024), // 10TB
        maxUsers: 100,
        features: {
          backblazeStorage: true,
          videoProcessing: true,
          analytics: true,
          customBranding: true
        }
      }
    });
    
    console.log('✅ Visit Detroit organization created:', organization.id);
    
    // Create admin user
    const adminPassword = 'VisitDetroit2024!'; // Change this in production
    const adminPasswordHash = await argon2.hash(adminPassword);
    
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@visitdetroit.com' },
      update: {},
      create: {
        email: 'admin@visitdetroit.com',
        name: 'Visit Detroit Admin',
        passwordHash: adminPasswordHash,
        role: 'admin',
        orgId: organization.id,
        status: 'active'
      }
    });
    
    console.log('✅ Admin user created:', adminUser.email);
    
    // Create demo user
    const demoPassword = 'demo123';
    const demoPasswordHash = await argon2.hash(demoPassword);
    
    const demoUser = await prisma.user.upsert({
      where: { email: 'demo@visitdetroit.com' },
      update: {},
      create: {
        email: 'demo@visitdetroit.com',
        name: 'Demo User',
        passwordHash: demoPasswordHash,
        role: 'user',
        orgId: organization.id,
        status: 'active'
      }
    });
    
    console.log('✅ Demo user created:', demoUser.email);
    
    console.log('\n🎉 Visit Detroit setup complete!');
    console.log('\n📋 Login Credentials:');
    console.log('Admin: admin@visitdetroit.com / VisitDetroit2024!');
    console.log('Demo:  demo@visitdetroit.com / demo123');
    
  } catch (error) {
    console.error('❌ Error setting up Visit Detroit:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setupVisitDetroit();
}

module.exports = { setupVisitDetroit };