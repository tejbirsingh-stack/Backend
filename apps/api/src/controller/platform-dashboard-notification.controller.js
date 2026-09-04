const prisma = require('../utils/prisma');
const B2StorageService = require('../b2-storage.cjs');
const { getB2Storage } = require('../services/b2Config');

/** Lazily-resolved B2 storage (creds from .env in dev, AWS Secrets Manager in all other envs) */
async function b2() { return getB2Storage(B2StorageService); }

const NOTIFICATION_MEDIA_FOLDER = 'notification-media';

// Presigned URLs are cached for 23 hours in the DB.
// We regenerate if less than 1 hour remains before expiry.
const URL_TTL_SECONDS = 23 * 3600; // 23h
const URL_REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 1h

async function getOrCreateDashboardNotification() {
  let notification = await prisma.dashboardNotification.findFirst({
    include: { images: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!notification) {
    notification = await prisma.dashboardNotification.create({
      data: { isEnabled: false },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
  }
  return notification;
}

/**
 * Returns image data with presigned URLs.
 * Uses a DB-cached URL if it's still valid (>1h left), otherwise
 * generates a new one from B2 and saves it — so the next request is instant.
 */
async function resolveImagesWithUrls(images) {
  const now = Date.now();

  return Promise.all(
    images.map(async (img) => {
      let url = null;

      if (img.filePath && (await b2()).isEnabled()) {
        const cacheStillValid =
          img.cachedUrl &&
          img.cachedUrlExpiresAt &&
          new Date(img.cachedUrlExpiresAt).getTime() - now > URL_REFRESH_THRESHOLD_MS;

        if (cacheStillValid) {
          // Fast path: return cached URL without any B2 API call
          url = img.cachedUrl;
        } else {
          // Slow path: generate a fresh presigned URL and persist it
          try {
            url = await (await b2()).getPresignedUrl(img.filePath, URL_TTL_SECONDS);
            const expiresAt = new Date(now + URL_TTL_SECONDS * 1000);
            // Fire-and-forget update — don't block the response
            prisma.dashboardNotificationImage
              .update({
                where: { id: img.id },
                data: { cachedUrl: url, cachedUrlExpiresAt: expiresAt },
              })
              .catch((e) => console.warn('[dash-notif] url cache update failed:', e.message));
          } catch (e) {
            console.warn('[dash-notif] presign failed:', e.message);
          }
        }
      }

      return {
        id: img.id,
        filePath: img.filePath,
        fileName: img.fileName,
        mimeType: img.mimeType,
        sizeBytes: img.sizeBytes?.toString?.() ?? '0',
        sortOrder: img.sortOrder,
        url,
      };
    })
  );
}

function serializeNotification(notification, resolvedImages = []) {
  return {
    isEnabled: Boolean(notification.isEnabled),
    title: notification.title || '',
    body: notification.body || '',
    ctaLabel: notification.ctaLabel || '',
    ctaUrl: notification.ctaUrl || '',
    updatedAt: notification.updatedAt,
    images: resolvedImages,
  };
}

module.exports.getDashboardNotification = async (request, reply) => {
  try {
    const notification = await getOrCreateDashboardNotification();
    const resolvedImages = await resolveImagesWithUrls(notification.images || []);
    return reply.send({
      success: true,
      notification: serializeNotification(notification, resolvedImages),
    });
  } catch (error) {
    console.error('Error fetching dashboard notification:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to fetch dashboard notification',
    });
  }
};

module.exports.updateDashboardNotification = async (request, reply) => {
  try {
    const { isEnabled, title, body, ctaLabel, ctaUrl } = request.body || {};
    const existing = await getOrCreateDashboardNotification();

    const updateData = {};
    if (typeof isEnabled === 'boolean') updateData.isEnabled = isEnabled;
    if (title !== undefined) updateData.title = title === '' ? null : title;
    if (body !== undefined) updateData.body = body === '' ? null : body;
    if (ctaLabel !== undefined) updateData.ctaLabel = ctaLabel === '' ? null : ctaLabel;
    if (ctaUrl !== undefined) updateData.ctaUrl = ctaUrl === '' ? null : ctaUrl;

    const updated = await prisma.dashboardNotification.update({
      where: { id: existing.id },
      data: updateData,
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    const resolvedImages = await resolveImagesWithUrls(updated.images || []);
    return reply.send({
      success: true,
      message: 'Dashboard notification updated successfully',
      notification: serializeNotification(updated, resolvedImages),
    });
  } catch (error) {
    console.error('Error updating dashboard notification:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to update dashboard notification',
    });
  }
};

module.exports.uploadNotificationImage = async (request, reply) => {
  if (!(await b2()).isEnabled()) {
    return reply.status(500).send({
      error: 'StorageNotConfigured',
      message: 'Cloud storage is not configured',
    });
  }

  let uploadedFile = null;
  let uploadError = null;

  try {
    const notification = await getOrCreateDashboardNotification();

    const parts = request.parts();

    for await (const part of parts) {
      // Only handle the first file part; drain the rest to avoid stream corruption
      if (part.file) {
        if (uploadedFile === null && uploadError === null) {
          // Process this file
          try {
            const mimeType = part.mimetype || 'application/octet-stream';
            
            // Validation 1: Only allow images
            if (!mimeType.startsWith('image/')) {
              uploadError = new Error('Only image files are allowed');
              throw uploadError;
            }

            // Validation 2: Max 10 images limit
            const imageCount = await prisma.dashboardNotificationImage.count({
              where: { notificationId: notification.id },
            });
            if (imageCount >= 10) {
              uploadError = new Error('Maximum limit of 10 images reached');
              throw uploadError;
            }

            const safeFileName = String(part.filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
            const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const b2Key = `${NOTIFICATION_MEDIA_FOLDER}/${uniqueId}/${safeFileName}`;

            let measured = 0;
            part.file.on('data', (chunk) => { measured += chunk.length; });

            await (await b2()).uploadStream(part.file, b2Key, mimeType, {
              type: 'notification-media',
            });

            const sizeBytes = part.file.bytesRead || measured;

            const maxOrder = await prisma.dashboardNotificationImage.aggregate({
              where: { notificationId: notification.id },
              _max: { sortOrder: true },
            });
            const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

            // Generate and cache a presigned URL immediately after upload
            let cachedUrl = null;
            let cachedUrlExpiresAt = null;
            try {
              cachedUrl = await (await b2()).getPresignedUrl(b2Key, URL_TTL_SECONDS);
              cachedUrlExpiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000);
            } catch (e) {
              console.warn('[dash-notif] post-upload presign failed:', e.message);
            }

            const image = await prisma.dashboardNotificationImage.create({
              data: {
                notificationId: notification.id,
                filePath: b2Key,
                fileName: safeFileName,
                mimeType,
                sizeBytes: BigInt(sizeBytes),
                sortOrder,
                cachedUrl,
                cachedUrlExpiresAt,
              },
            });

            uploadedFile = {
              id: image.id,
              filePath: image.filePath,
              fileName: image.fileName,
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes?.toString?.() ?? '0',
              sortOrder: image.sortOrder,
              url: cachedUrl,
            };
          } catch (err) {
            uploadError = err;
            // Still need to drain the stream — consume remaining data silently
            try {
              for await (const _chunk of part.file) { /* drain */ }
            } catch (_) {}
          }
        } else {
          // Drain any additional file parts we don't need
          try {
            for await (const _chunk of part.file) { /* drain */ }
          } catch (_) {}
        }
      }
      // Non-file field parts are consumed automatically by iterating
    }

    if (uploadError) {
      console.error('[dash-notif] upload error:', uploadError.message);
      return reply.status(400).send({
        error: 'ValidationError',
        message: uploadError.message || 'Failed to upload notification image',
      });
    }

    if (!uploadedFile) {
      return reply.status(400).send({ error: 'No file part found in request' });
    }

    return reply.send({ success: true, image: uploadedFile });
  } catch (error) {
    console.error('Error uploading notification image:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to upload notification image',
    });
  }
};

module.exports.deleteNotificationImage = async (request, reply) => {
  try {
    const { imageId } = request.params;
    const image = await prisma.dashboardNotificationImage.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      return reply.status(404).send({ error: 'Image not found' });
    }

    await prisma.dashboardNotificationImage.delete({ where: { id: imageId } });

    // Bump notification updatedAt so clients re-show the popup after image changes
    const notification = await getOrCreateDashboardNotification();
    await prisma.dashboardNotification.update({
      where: { id: notification.id },
      data: { updatedAt: new Date() },
    });

    if ((await b2()).isEnabled() && image.filePath) {
      try {
        await (await b2()).permanentlyDeleteFile(image.filePath);
      } catch (e) {
        console.warn('[dash-notif] B2 delete warning:', e.message);
      }
    }

    return reply.send({ success: true });
  } catch (error) {
    console.error('Error deleting notification image:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to delete notification image',
    });
  }
};
