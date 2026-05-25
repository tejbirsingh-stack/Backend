import { PrismaClient } from '@prisma/client';

async function seedDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🌱 Starting database seeding...');
    
    // Create a test organization
    const org = await prisma.organization.create({
      data: {
        name: 'Demo Organization',
        slug: 'demo-org-' + new Date().getTime(),
        planType: 'PROFESSIONAL',
        features: {
          compressionEnabled: true,
          aiAnalysisEnabled: true,
          maxStorageGB: 1000,
        },
        metadata: {
          createdBy: 'System',
          notes: 'Test organization for development',
        },
      },
    });
    console.log(`✅ Created organization: ${org.name}`);
    
    // Create a test user
    const user = await prisma.user.create({
      data: {
        email: `admin-${new Date().getTime()}@noahmam.com`,
        name: 'Admin User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$UrMxBDN6KwGnfZuxUgN6pA$zO7KD3CzyTMYyJPJ2Bpt0MFVO/9BZwKrK8XDuI9wbcQ', // Password: admin123
        role: 'ADMIN',
        orgId: org.id
      },
    });
    console.log(`✅ Created user: ${user.name} (${user.email})`);
    
    // Create some test tags
    const tags = await Promise.all([
      prisma.tag.create({
        data: {
          name: 'Interview',
          color: '#FF5733',
          orgId: org.id,
        }
      }),
      prisma.tag.create({
        data: {
          name: 'Documentary',
          color: '#33FF57',
          orgId: org.id,
        }
      }),
      prisma.tag.create({
        data: {
          name: 'Raw Footage',
          color: '#3357FF',
          orgId: org.id,
        }
      })
    ]);
    console.log(`✅ Created ${tags.length} tags`);
    
    // Create a test collection
    const collection = await prisma.collection.create({
      data: {
        name: 'Test Project',
        description: 'A test project for development',
        orgId: org.id,
        createdById: user.id,
      }
    });
    console.log(`✅ Created collection: ${collection.name}`);
    
    // Create a test media asset
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        fileName: 'test-video.mp4',
        fileSize: 1024 * 1024 * 50, // 50 MB
        originalSize: 1024 * 1024 * 100, // 100 MB (original before compression)
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        durationSeconds: 300, // 5 minutes
        filePath: 'test-org/test-video.mp4',
        fileExtension: 'mp4',
        status: 'PROCESSED',
        orgId: org.id,
        uploadedByUserId: user.id,
        cdnUrl: 'https://via.placeholder.com/640x360',
        metadata: {
          codec: 'h264',
          fps: 30,
          bitrate: '5mbps',
        }
      }
    });
    console.log(`✅ Created media asset: ${mediaAsset.fileName}`);
    
    // Create the relationship between the collection and the media asset
    await prisma.collectionAsset.create({
      data: {
        collectionId: collection.id,
        assetId: mediaAsset.id,
        addedById: user.id
      }
    });
    console.log(`✅ Added media asset to collection`);
    
    // Create the relationships between tags and the media asset
    for (const tag of tags) {
      await prisma.assetTag.create({
        data: {
          assetId: mediaAsset.id,
          tagId: tag.id,
          addedById: user.id
        }
      });
    }
    console.log(`✅ Added tags to media asset`);
    
    console.log('🎉 Database seeding completed successfully!');
    
    // Print summary
    console.log('\n📊 Database Summary:');
    console.log(`- Organizations: ${await prisma.organization.count()}`);
    console.log(`- Users: ${await prisma.user.count()}`);
    console.log(`- Collections: ${await prisma.collection.count()}`);
    console.log(`- Media Assets: ${await prisma.mediaAsset.count()}`);
    console.log(`- Tags: ${await prisma.tag.count()}`);
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();
