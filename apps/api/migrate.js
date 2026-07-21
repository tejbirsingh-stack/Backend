const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration from MediaAsset to New Architecture...');
  const oldAssets = await prisma.mediaAsset.findMany();
  console.log(`Found ${oldAssets.length} old assets.`);

  for (const old of oldAssets) {
    try {
      const typeMap = { 'video': 'video', 'audio': 'audio', 'image': 'image' };
      const assetType = Object.keys(typeMap).find(k => old.mimeType.startsWith(`${k}/`)) || 'document';
      
      const newAsset = await prisma.asset.create({
        data: {
          id: old.id, // KEEP SAME ID!
          orgId: old.orgId,
          title: old.fileName,
          type: assetType,
          status: old.status === 'ready' ? 'active' : old.status,
          createdAt: old.createdAt,
          updatedAt: old.updatedAt,
          deletedAt: old.deletedAt,
          metadata: {
            create: {
              technicalSpecs: old.durationSeconds ? { durationSeconds: old.durationSeconds } : {}
            }
          }
        }
      });

      // Original File
      await prisma.assetFile.create({
        data: {
          assetId: newAsset.id,
          fileClass: 'original',
          fileName: old.customMetadata?.originalFilePath ? old.customMetadata.originalFilePath.split('/').pop() : old.fileName,
          filePath: old.customMetadata?.originalFilePath || old.filePath,
          sizeBytes: old.originalSize,
          mimeType: old.mimeType,
          cdnUrl: old.cdnUrl
        }
      });

      // Proxy File (if compressed)
      if (old.customMetadata?.originalFilePath) {
        await prisma.assetFile.create({
          data: {
            assetId: newAsset.id,
            fileClass: 'proxy',
            fileName: old.filePath.split('/').pop(),
            filePath: old.filePath,
            sizeBytes: old.fileSize,
            mimeType: 'video/mp4',
            cdnUrl: old.cdnUrl
          }
        });
      }

      console.log(`Migrated asset: ${old.id}`);
    } catch (e) {
      console.log(`Skipped/Failed asset: ${old.id} - ${e.message}`);
    }
  }
  console.log('Migration complete!');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
