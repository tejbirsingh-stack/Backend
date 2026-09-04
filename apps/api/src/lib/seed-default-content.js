const B2StorageService = require('../b2-storage.cjs');
const { getB2Storage } = require('../services/b2Config');

/** Lazily-resolved B2 storage (creds from .env in dev, AWS Secrets Manager in all other envs) */
async function b2() { return getB2Storage(B2StorageService); }

function sanitizeSlug(value, fallback = 'org') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || fallback;
}

function subFolderForType(assetType) {
  if (assetType === 'image') return 'images';
  if (assetType === 'audio') return 'audios';
  if (assetType === 'video') return 'videos';
  return 'files';
}

/**
 * Copy enabled platform default-content templates into a newly created workspace.
 * Safe to call repeatedly — skips items already seeded into the same workspace.
 */
async function seedDefaultContentIntoWorkspace(prisma, { orgId, workspaceId, orgName, uploadedByUserId = null }) {
  if (!prisma || !orgId || !workspaceId) return { seeded: 0, skipped: 0 };

  const items = await prisma.platformDefaultContent.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (!items.length) return { seeded: 0, skipped: 0 };

  const existing = await prisma.asset.findMany({
    where: {
      orgId,
      workspaceId,
      status: { not: 'trash' },
    },
    include: { metadata: true },
  });

  const alreadySeeded = new Set(
    existing
      .map((asset) => {
        const props = asset.metadata?.customProperties;
        if (props && typeof props === 'object' && props.platformDefaultContentId) {
          return String(props.platformDefaultContentId);
        }
        return null;
      })
      .filter(Boolean),
  );

  const orgSlug = sanitizeSlug(orgName, 'org');
  let seeded = 0;
  let skipped = 0;

  for (const item of items) {
    if (alreadySeeded.has(item.id)) {
      skipped += 1;
      continue;
    }

    try {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const safeFileName = String(item.fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
      const baseName = safeFileName.replace(/\.[^/.]+$/, '').toLowerCase() || 'file';
      const subFolder = subFolderForType(item.assetType);
      let finalPath = item.filePath;

      const _b2 = await b2();
      if (_b2.isEnabled() && item.filePath) {
        const destKey = `noah-uploads/${orgSlug}/${subFolder}/platform-default/${baseName}-${uniqueId}/${uniqueId}-raw-${safeFileName}`;
        try {
          await _b2.copyFile(item.filePath, destKey);
          finalPath = destKey;
        } catch (copyErr) {
          console.warn(
            `[seedDefaultContent] B2 copy failed for ${item.id}, using shared template key:`,
            copyErr.message,
          );
        }
      }

      await prisma.asset.create({
        data: {
          orgId,
          title: item.title || item.fileName,
          type: item.assetType || 'document',
          status: 'active',
          visibility: 'public',
          ownerType: 'WORKSPACE',
          ownerId: workspaceId,
          workspaceId,
          uploadedByUserId: uploadedByUserId || null,
          files: {
            create: {
              fileClass: 'original',
              fileName: item.fileName,
              filePath: finalPath,
              sizeBytes: item.sizeBytes,
              mimeType: item.mimeType,
            },
          },
          metadata: {
            create: {
              technicalSpecs: {},
              customProperties: {
                platformDefaultContentId: item.id,
                seededFromPlatform: true,
              },
            },
          },
        },
      });

      seeded += 1;
    } catch (err) {
      console.error(`[seedDefaultContent] Failed for item ${item.id}:`, err.message);
      skipped += 1;
    }
  }

  return { seeded, skipped };
}

/**
 * Sync enabled default content items to all existing workspaces where isDefault = true.
 */
async function syncGlobalMediaToAllDefaultWorkspaces(prisma) {
  if (!prisma) return { seededTotal: 0, workspaceCount: 0 };

  const defaultWorkspaces = await prisma.workspace.findMany({
    where: { isDefault: true },
    include: { organization: { select: { name: true } } },
  });

  let seededTotal = 0;
  for (const ws of defaultWorkspaces) {
    const res = await seedDefaultContentIntoWorkspace(prisma, {
      orgId: ws.orgId,
      workspaceId: ws.id,
      orgName: ws.organization?.name || 'organization',
    });
    seededTotal += res.seeded || 0;
  }

  return { seededTotal, workspaceCount: defaultWorkspaces.length };
}

module.exports = {
  seedDefaultContentIntoWorkspace,
  syncGlobalMediaToAllDefaultWorkspaces,
};
