const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');
const B2StorageService = require('../b2-storage.cjs');

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

function normalizeAssetType(mimeType = '', filename = '') {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  if (mime.startsWith('audio/') || /\.(mp3|wav|flac|aac|m4a|ogg|aiff)$/.test(name)) return 'audio';
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|mxf|m4v)$/.test(name)) return 'video';
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|tiff|tif|bmp|psd)$/.test(name)) {
    return 'image';
  }
  return 'document';
}

function serializeItem(item, previewUrl = null) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    fileName: item.fileName,
    filePath: item.filePath,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes?.toString?.() ?? String(item.sizeBytes ?? 0),
    assetType: item.assetType,
    sortOrder: item.sortOrder,
    isEnabled: item.isEnabled,
    uploadedById: item.uploadedById,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    previewUrl,
  };
}

async function withPreviewUrl(item) {
  let previewUrl = null;
  if (item?.filePath && b2Storage.isEnabled()) {
    try {
      previewUrl = await b2Storage.getPresignedUrl(item.filePath, 3600);
    } catch (err) {
      console.warn('[default-content] preview URL failed:', err.message);
    }
  }
  return serializeItem(item, previewUrl);
}

async function listDefaultContent(request, reply) {
  try {
    const items = await prisma.platformDefaultContent.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // Also fetch any standalone Global Media assets from Asset table if present
    const globalAssets = await prisma.asset.findMany({
      where: { globalMedia: true, deletedAt: null },
      include: { files: true },
      orderBy: { createdAt: 'asc' },
    });

    // Map platform default content items
    const serialized = await Promise.all(items.map((item) => withPreviewUrl(item)));

    // Merge any globalAssets not already in serialized
    const existingFilePaths = new Set(serialized.map((s) => s.filePath));
    for (const gAsset of globalAssets) {
      const origFile = gAsset.files?.find((f) => f.fileClass === 'original') || gAsset.files?.[0];
      if (origFile && !existingFilePaths.has(origFile.filePath)) {
        let previewUrl = null;
        if (origFile.filePath && b2Storage.isEnabled()) {
          try {
            previewUrl = await b2Storage.getPresignedUrl(origFile.filePath, 3600);
          } catch (err) {
            console.warn('[default-content] global asset preview URL failed:', err.message);
          }
        }
        serialized.push({
          id: gAsset.id,
          title: gAsset.title,
          fileName: origFile.fileName || gAsset.title,
          filePath: origFile.filePath,
          mimeType: origFile.mimeType || 'application/octet-stream',
          sizeBytes: origFile.sizeBytes?.toString?.() ?? '0',
          assetType: gAsset.type || 'document',
          sortOrder: serialized.length,
          isEnabled: gAsset.status === 'active',
          uploadedById: gAsset.uploadedByUserId || null,
          createdAt: gAsset.createdAt,
          updatedAt: gAsset.updatedAt,
          previewUrl,
          globalMedia: true,
        });
      }
    }

    return { success: true, total: serialized.length, items: serialized };
  } catch (error) {
    console.error('listDefaultContent error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list default content',
      statusCode: 500,
    });
  }
}

async function uploadDefaultContent(request, reply) {
  try {
    if (!b2Storage.isEnabled()) {
      return reply.status(500).send({
        error: 'StorageNotConfigured',
        message: 'Cloud storage is not configured',
        statusCode: 500,
      });
    }

    const parts = request.parts();
    let title = '';
    let sortOrder = 0;
    let isEnabled = true;
    let uploadedFile = null;
    let sizeBytes = 0;

    for await (const part of parts) {
      if (part.file) {
        const safeFileName = String(part.filename || 'untitled').replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const mimeType = part.mimetype || 'application/octet-stream';
        const assetType = normalizeAssetType(mimeType, safeFileName);
        const subFolder =
          assetType === 'image'
            ? 'images'
            : assetType === 'audio'
              ? 'audios'
              : assetType === 'video'
                ? 'videos'
                : 'documents';
        const b2Key = `global-media/${subFolder}/${uniqueId}/${safeFileName}`;

        let measured = 0;
        part.file.on('data', (chunk) => {
          measured += chunk.length;
        });

        await b2Storage.uploadStream(part.file, b2Key, mimeType, {
          type: 'global-media',
          uploadedBy: request.platformAdmin?.id || 'unknown',
        });

        sizeBytes = part.file.bytesRead || measured;
        uploadedFile = {
          fileName: part.filename || safeFileName,
          filePath: b2Key,
          mimeType,
          assetType,
          sizeBytes,
        };
      } else if (part.fieldname === 'title') {
        title = String(part.value || '').trim();
      } else if (part.fieldname === 'sortOrder') {
        const n = Number(part.value);
        if (Number.isFinite(n)) sortOrder = Math.max(0, Math.floor(n));
      } else if (part.fieldname === 'isEnabled') {
        isEnabled = String(part.value).toLowerCase() !== 'false';
      }
    }

    if (!uploadedFile) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'A file is required',
        statusCode: 400,
      });
    }

    if (!title) {
      title = uploadedFile.fileName.replace(/\.[^/.]+$/, '') || uploadedFile.fileName;
    }

    const maxOrder = await prisma.platformDefaultContent.aggregate({
      _max: { sortOrder: true },
    });
    if (sortOrder === 0 && maxOrder._max.sortOrder != null) {
      sortOrder = maxOrder._max.sortOrder + 1;
    }

    // 1. Create PlatformDefaultContent record
    const item = await prisma.platformDefaultContent.create({
      data: {
        title,
        fileName: uploadedFile.fileName,
        filePath: uploadedFile.filePath,
        mimeType: uploadedFile.mimeType,
        sizeBytes: BigInt(uploadedFile.sizeBytes || 0),
        assetType: uploadedFile.assetType,
        sortOrder,
        isEnabled,
        uploadedById: request.platformAdmin?.id || null,
      },
    });

    // 2. Create Asset record with globalMedia = true (no orgId, workspaceId, or ownerId assigned)
    try {
      await prisma.asset.create({
        data: {
          orgId: null,
          title,
          type: uploadedFile.assetType,
          status: 'active',
          visibility: 'public',
          globalMedia: true,
          ownerType: null,
          ownerId: null,
          workspaceId: null,
          uploadedByUserId: null,
          files: {
            create: {
              fileClass: 'original',
              fileName: uploadedFile.fileName,
              filePath: uploadedFile.filePath,
              sizeBytes: BigInt(uploadedFile.sizeBytes || 0),
              mimeType: uploadedFile.mimeType,
              cdnUrl: `/api/media/${encodeURIComponent(uploadedFile.filePath)}/stream`,
            },
          },
          metadata: {
            create: {
              technicalSpecs: {
                fileSize: Number(uploadedFile.sizeBytes || 0),
                sizeBytes: Number(uploadedFile.sizeBytes || 0),
              },
            },
          },
        },
      });
    } catch (assetErr) {
      console.warn('[uploadDefaultContent] Asset record creation warning:', assetErr.message);
    }

    // Auto-sync new content to all default workspaces
    try {
      const { syncGlobalMediaToAllDefaultWorkspaces } = require('../lib/seed-default-content');
      await syncGlobalMediaToAllDefaultWorkspaces(prisma);
    } catch (syncErr) {
      console.warn('[uploadDefaultContent] Auto-sync warning:', syncErr.message);
    }

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.DEFAULT_CONTENT_UPLOADED,
      description: `Uploaded Global Media starter file "${item.title}" (${item.fileName})`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
    });

    const serializedItem = await withPreviewUrl(item);
    if (serializedItem) serializedItem.globalMedia = true;
    return { success: true, item: serializedItem };
  } catch (error) {
    console.error('uploadDefaultContent error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to upload default content',
      statusCode: 500,
    });
  }
}

async function syncDefaultContentToWorkspaces(request, reply) {
  try {
    const { syncGlobalMediaToAllDefaultWorkspaces } = require('../lib/seed-default-content');
    const result = await syncGlobalMediaToAllDefaultWorkspaces(prisma);

    return {
      success: true,
      message: `Synced default content to ${result.workspaceCount} default workspaces (${result.seededTotal} new assets seeded).`,
      ...result,
    };
  } catch (error) {
    console.error('syncDefaultContentToWorkspaces error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to sync default content',
      statusCode: 500,
    });
  }
}

async function updateDefaultContent(request, reply) {
  try {
    const { id } = request.params;
    const body = request.body || {};
    const existing = await prisma.platformDefaultContent.findUnique({ where: { id } });

    // Also check if id is an Asset id
    const existingAsset = !existing ? await prisma.asset.findUnique({ where: { id }, include: { files: true } }) : null;

    if (!existing && !existingAsset) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Default content item not found',
        statusCode: 404,
      });
    }

    if (existing) {
      const data = {};
      if (body.title !== undefined) {
        const title = String(body.title || '').trim();
        if (!title) {
          return reply.status(400).send({
            error: 'ValidationError',
            message: 'title cannot be empty',
            statusCode: 400,
          });
        }
        data.title = title;
      }
      if (body.sortOrder !== undefined) {
        const n = Number(body.sortOrder);
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({
            error: 'ValidationError',
            message: 'sortOrder must be a non-negative number',
            statusCode: 400,
          });
        }
        data.sortOrder = Math.floor(n);
      }
      if (body.isEnabled !== undefined) {
        data.isEnabled = Boolean(body.isEnabled);
      }

      const item = await prisma.platformDefaultContent.update({
        where: { id },
        data,
      });

      // Sync Asset title/status if matching Asset exists
      try {
        const matchingAssetFile = await prisma.assetFile.findFirst({
          where: { filePath: existing.filePath },
          select: { assetId: true },
        });
        if (matchingAssetFile) {
          await prisma.asset.update({
            where: { id: matchingAssetFile.assetId },
            data: {
              ...(data.title ? { title: data.title } : {}),
              ...(data.isEnabled !== undefined ? { status: data.isEnabled ? 'active' : 'inactive' } : {}),
            },
          });
        }

        // Also update any Asset records with globalMedia = true matching title or filePath
        await prisma.asset.updateMany({
          where: {
            OR: [
              { globalMedia: true, title: existing.title },
              { files: { some: { filePath: existing.filePath } } }
            ]
          },
          data: {
            ...(data.title ? { title: data.title } : {}),
            ...(data.isEnabled !== undefined ? { status: data.isEnabled ? 'active' : 'inactive' } : {}),
          }
        });
      } catch (syncErr) {
        console.warn('[updateDefaultContent] Asset sync warning:', syncErr.message);
      }

      await writePlatformAudit({
        activityName: ACTIVITY_NAME.DEFAULT_CONTENT_UPDATED,
        description: `Updated starter file "${item.title}"`,
        activityType: ACTIVITY_TYPE.INFO,
        admin: request.platformAdmin,
      });

      const serializedItem = await withPreviewUrl(item);
      if (serializedItem) serializedItem.globalMedia = true;
      return { success: true, item: serializedItem };
    } else if (existingAsset) {
      const assetData = {};
      if (body.title) assetData.title = String(body.title).trim();
      if (body.isEnabled !== undefined) assetData.status = body.isEnabled ? 'active' : 'inactive';
      const updatedAsset = await prisma.asset.update({
        where: { id },
        data: assetData,
        include: { files: true },
      });

      const origFile = updatedAsset.files?.find((f) => f.fileClass === 'original') || updatedAsset.files?.[0];
      let previewUrl = null;
      if (origFile?.filePath && b2Storage.isEnabled()) {
        try {
          previewUrl = await b2Storage.getPresignedUrl(origFile.filePath, 3600);
        } catch (e) { }
      }

      return {
        success: true,
        item: {
          id: updatedAsset.id,
          title: updatedAsset.title,
          fileName: origFile?.fileName || updatedAsset.title,
          filePath: origFile?.filePath || '',
          mimeType: origFile?.mimeType || 'application/octet-stream',
          sizeBytes: origFile?.sizeBytes?.toString?.() ?? '0',
          assetType: updatedAsset.type,
          sortOrder: 0,
          isEnabled: updatedAsset.status === 'active',
          uploadedById: updatedAsset.uploadedByUserId,
          createdAt: updatedAsset.createdAt,
          updatedAt: updatedAsset.updatedAt,
          previewUrl,
          globalMedia: true,
        },
      };
    }
  } catch (error) {
    console.error('updateDefaultContent error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update default content',
      statusCode: 500,
    });
  }
}

async function deleteDefaultContent(request, reply) {
  try {
    const { id } = request.params;
    const existing = await prisma.platformDefaultContent.findUnique({ where: { id } });
    const existingAsset = !existing ? await prisma.asset.findUnique({ where: { id }, include: { files: true } }) : null;

    if (!existing && !existingAsset) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Default content item not found',
        statusCode: 404,
      });
    }

    const filePathsToDelete = new Set();

    if (existing) {
      if (existing.filePath) filePathsToDelete.add(existing.filePath);

      try {
        const matchingAssetFiles = await prisma.assetFile.findMany({
          where: { filePath: existing.filePath },
          select: { assetId: true, filePath: true },
        });

        const assetIdsToDelete = matchingAssetFiles.map((af) => af.assetId);

        const seededAssets = await prisma.asset.findMany({
          where: {
            OR: [
              { title: existing.title },
              { globalMedia: true },
            ],
          },
          include: { files: true },
        });

        for (const sa of seededAssets) {
          const hasMatchingFile = sa.files?.some((f) => f.filePath === existing.filePath || f.fileName === existing.fileName);
          if (hasMatchingFile || (sa.globalMedia && sa.title === existing.title)) {
            assetIdsToDelete.push(sa.id);
            for (const f of sa.files || []) {
              if (f.filePath) filePathsToDelete.add(f.filePath);
            }
          }
        }

        const uniqueAssetIds = Array.from(new Set(assetIdsToDelete));
        if (uniqueAssetIds.length > 0) {
          await prisma.asset.deleteMany({
            where: { id: { in: uniqueAssetIds } },
          });
        }
      } catch (delAssetErr) {
        console.warn('[deleteDefaultContent] Asset delete warning:', delAssetErr.message);
      }

      await prisma.platformDefaultContent.delete({ where: { id } });
    } else if (existingAsset) {
      for (const f of existingAsset.files || []) {
        if (f.filePath) filePathsToDelete.add(f.filePath);
      }
      await prisma.asset.delete({ where: { id } });
    }

    if (b2Storage.isEnabled()) {
      for (const filePath of filePathsToDelete) {
        try {
          await b2Storage.permanentlyDeleteFile(filePath);
        } catch (delErr) {
          console.warn(`[default-content] Failed to delete B2 file ${filePath}:`, delErr.message);
        }
      }
    }

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.DEFAULT_CONTENT_DELETED,
      description: `Permanently deleted Global Media file "${existing?.title || existingAsset?.title}"`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
    });

    return { success: true };
  } catch (error) {
    console.error('deleteDefaultContent error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to delete default content',
      statusCode: 500,
    });
  }
}

module.exports = {
  listDefaultContent,
  uploadDefaultContent,
  updateDefaultContent,
  deleteDefaultContent,
  syncDefaultContentToWorkspaces,
};
