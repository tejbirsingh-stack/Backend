const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillUsage() {
  console.log('🚀 Starting usage backfill and storage reconciliation...');

  try {
    const orgs = await prisma.organization.findMany();
    console.log(`Found ${orgs.length} organization(s).`);

    for (const org of orgs) {
      console.log(`\nProcessing Organization: ${org.name} (${org.id})...`);

      // 1. Ensure primary Backblaze B2 StorageSystem row exists
      let b2StorageSystem = await prisma.storageSystem.findFirst({
        where: {
          orgId: org.id,
          provider: 'BACKBLAZE_B2',
        },
      });

      if (!b2StorageSystem) {
        b2StorageSystem = await prisma.storageSystem.create({
          data: {
            orgId: org.id,
            provider: 'BACKBLAZE_B2',
            name: 'Backblaze B2 Primary Storage',
            isPrimary: true,
            status: 'active',
            config: {
              bucket: process.env.B2_BUCKET_NAME || 'noah-media-storage',
            },
          },
        });
        console.log(`  ✅ Created primary StorageSystem row (${b2StorageSystem.id})`);
      } else {
        console.log(`  ℹ️ Found existing StorageSystem row (${b2StorageSystem.id})`);
      }

      // 2. Sum sizeBytes of all AssetFiles linked to non-permanently-deleted Assets
      const result = await prisma.assetFile.aggregate({
        _sum: {
          sizeBytes: true,
        },
        where: {
          fileClass: { in: ['original', 'master'] },
          asset: {
            orgId: org.id,
            status: {
              not: 'permanently_deleted',
            },
          },
        },
      });

      const actualBytes = BigInt(result._sum.sizeBytes || 0);
      console.log(`  📊 Actual AssetFile storage count: ${actualBytes} bytes (${(Number(actualBytes) / (1024 * 1024)).toFixed(2)} MB)`);

      // 3. Update Organization storageUsedBytes
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          storageUsedBytes: actualBytes,
        },
      });
      console.log(`  ✅ Updated Organization.storageUsedBytes to ${actualBytes}`);

      // 4. Create opening UsageDailyRollup for today
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await prisma.usageDailyRollup.upsert({
        where: {
          orgId_storageSystemId_date: {
            orgId: org.id,
            storageSystemId: b2StorageSystem.id,
            date: today,
          },
        },
        update: {
          storageBytesEnd: actualBytes,
        },
        create: {
          orgId: org.id,
          storageSystemId: b2StorageSystem.id,
          date: today,
          storageBytesEnd: actualBytes,
          bandwidthBytes: BigInt(0),
          classACount: BigInt(0),
          classBCount: BigInt(0),
        },
      });
      console.log(`  ✅ Opening UsageDailyRollup saved for date ${today.toISOString().split('T')[0]}`);
    }

    console.log('\n🎉 Backfill and storage reconciliation complete!');
  } catch (error) {
    console.error('❌ Error during usage backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillUsage();
