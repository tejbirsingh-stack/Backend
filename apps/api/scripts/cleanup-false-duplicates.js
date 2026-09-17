/**
 * One-time cleanup: clear false-positive duplicate links for non-video assets.
 * Keeps a link only when both sides share the same non-empty checksum; otherwise
 * removes the link and restores status to 'active' when no valid links remain.
 *
 * Run after deploy against QA (from apps/api):
 *   node scripts/cleanup-false-duplicates.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting false-positive duplicate cleanup (non-video)...');

  const assets = await prisma.asset.findMany({
    where: {
      status: 'duplicate',
      type: { not: 'video' },
      deletedAt: null,
    },
    include: { metadata: true },
  });

  console.log(`Found ${assets.length} non-video assets with status=duplicate.`);

  let cleared = 0;
  let tightened = 0;
  let unchanged = 0;

  for (const asset of assets) {
    const customProps =
      typeof asset.metadata?.customProperties === 'object' && asset.metadata.customProperties
        ? { ...asset.metadata.customProperties }
        : {};
    const linkedIds = Array.isArray(customProps.duplicates) ? customProps.duplicates : [];
    const ownChecksum = asset.metadata?.checksum || null;

    const validLinks = [];
    if (ownChecksum && linkedIds.length > 0) {
      const linked = await prisma.asset.findMany({
        where: { id: { in: linkedIds } },
        include: { metadata: true },
      });
      const byId = new Map(linked.map((a) => [a.id, a]));
      for (const id of linkedIds) {
        const other = byId.get(id);
        if (other?.metadata?.checksum && other.metadata.checksum === ownChecksum) {
          validLinks.push(id);
        }
      }
    }

    if (validLinks.length === linkedIds.length && validLinks.length > 0) {
      unchanged += 1;
      continue;
    }

    if (validLinks.length === 0) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'active',
          metadata: {
            update: {
              customProperties: {
                ...customProps,
                duplicates: [],
              },
            },
          },
        },
      });
      cleared += 1;
      console.log(`Cleared false duplicate: ${asset.id} (${asset.title || 'untitled'})`);
    } else {
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'duplicate',
          metadata: {
            update: {
              customProperties: {
                ...customProps,
                duplicates: validLinks,
              },
            },
          },
        },
      });
      tightened += 1;
      console.log(
        `Tightened links for ${asset.id} (${asset.title || 'untitled'}): ${linkedIds.length} -> ${validLinks.length}`
      );
    }
  }

  console.log(`Done. cleared=${cleared} tightened=${tightened} unchanged=${unchanged}`);
}

main()
  .catch((err) => {
    console.error('cleanup-false-duplicates failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
