require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const B2StorageService = require('../src/b2-storage.cjs');
const { extractServerSideMetadata } = require('../src/utils/extractMediaMetadata');
const { exiftool } = require('exiftool-vendored');

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

async function main() {
  console.log("Starting EXIF Metadata Enrichment Script...");
  const assets = await prisma.asset.findMany({
    where: { deletedAt: null },
    include: { files: true, metadata: true }
  });

  console.log(`Found ${assets.length} assets to check/enrich.`);

  for (const asset of assets) {
    const originalFile = asset.files.find(f => f.fileClass === 'original');
    if (!originalFile || !originalFile.filePath) continue;

    console.log(`Processing asset: ${asset.id} (${asset.title}) - key: ${originalFile.filePath}`);

    try {
      const presignedUrl = await b2Storage.getPresignedUrl(originalFile.filePath, 3600);
      if (!presignedUrl) {
        console.warn(`Could not get presigned URL for ${asset.id}`);
        continue;
      }

      console.log(`Extracting EXIF via ExifTool from: ${presignedUrl}`);
      const serverMetadata = await extractServerSideMetadata(presignedUrl);
      console.log(`Extracted metadata for ${asset.id}:`, JSON.stringify(serverMetadata, null, 2));

      if (serverMetadata && Object.keys(serverMetadata).length > 0) {
        const existingTechSpecs = (asset.metadata && asset.metadata.technicalSpecs) ? asset.metadata.technicalSpecs : {};
        const updatedTechSpecs = {
          ...existingTechSpecs,
          ...serverMetadata,
          exif: {
            ...((existingTechSpecs.exif) || {}),
            ...((serverMetadata.exif) || {})
          }
        };

        await prisma.assetMetadata.upsert({
          where: { assetId: asset.id },
          update: { technicalSpecs: updatedTechSpecs },
          create: { assetId: asset.id, technicalSpecs: updatedTechSpecs }
        });

        console.log(`Successfully updated database assetMetadata for ${asset.id}`);
      }
    } catch (err) {
      console.error(`Error enriching asset ${asset.id}:`, err.message);
    }
  }

  await exiftool.end();
  await prisma.$disconnect();
  console.log("Enrichment completed!");
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
