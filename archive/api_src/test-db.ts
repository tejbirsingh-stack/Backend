import { PrismaClient } from '@prisma/client';

async function testDBConnection() {
  const prisma = new PrismaClient();
  
  try {
    // Try to connect to the database
    await prisma.$connect();
    console.log('✅ Successfully connected to the database');
    
    // Try to query some data
    const userCount = await prisma.user.count();
    console.log(`📊 Total users in database: ${userCount}`);
    
    const orgCount = await prisma.organization.count();
    console.log(`📊 Total organizations in database: ${orgCount}`);
    
    // List all models in prisma and their counts
    console.log('📊 Database statistics:');
    const mediaAssetCount = await prisma.mediaAsset.count();
    console.log(`- Media assets: ${mediaAssetCount}`);
    
    const collectionCount = await prisma.collection.count();
    console.log(`- Collections: ${collectionCount}`);
    
    const tagCount = await prisma.tag.count();
    console.log(`- Tags: ${tagCount}`);
    
    console.log('✅ Database testing completed successfully');
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDBConnection();
