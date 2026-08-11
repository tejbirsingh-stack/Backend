const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');
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
    const serialized = await Promise.all(items.map((item) => withPreviewUrl(item)));
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
                : 'files';
        const b2Key = `platform-default-content/${subFolder}/${uniqueId}/${safeFileName}`;

        let measured = 0;
        part.file.on('data', (chunk) => {
          measured += chunk.length;
        });

        await b2Storage.uploadStream(part.file, b2Key, mimeType, {
          type: 'platform-default-content',
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

    await writePlatformAudit({
      activityName: 'Default content uploaded',
      description: `Uploaded starter file "${item.title}" (${item.fileName})`,
      activityType: 'default_content',
      admin: request.platformAdmin,
    });

    return { success: true, item: await withPreviewUrl(item) };
  } catch (error) {
    console.error('uploadDefaultContent error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to upload default content',
      statusCode: 500,
    });
  }
}

async function updateDefaultContent(request, reply) {
  try {
    const { id } = request.params;
    const body = request.body || {};
    const existing = await prisma.platformDefaultContent.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Default content item not found',
        statusCode: 404,
      });
    }

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

    await writePlatformAudit({
      activityName: 'Default content updated',
      description: `Updated starter file "${item.title}"`,
      activityType: 'default_content',
      admin: request.platformAdmin,
    });

    return { success: true, item: await withPreviewUrl(item) };
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
    if (!existing) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Default content item not found',
        statusCode: 404,
      });
    }

    await prisma.platformDefaultContent.delete({ where: { id } });

    if (existing.filePath && b2Storage.isEnabled()) {
      try {
        await b2Storage.permanentlyDeleteFile(existing.filePath);
      } catch (delErr) {
        console.warn(`[default-content] Failed to delete B2 file ${existing.filePath}:`, delErr.message);
      }
    }

    await writePlatformAudit({
      activityName: 'Default content deleted',
      description: `Deleted starter file "${existing.title}" (${existing.fileName})`,
      activityType: 'default_content',
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
};
