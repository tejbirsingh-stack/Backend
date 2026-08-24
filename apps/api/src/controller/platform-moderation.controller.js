const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');

async function listModerationFlags(request, reply) {
  try {
    const status = request.query?.status ? String(request.query.status) : undefined;
    const flags = await prisma.platformModerationFlag.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        flaggedBy: { select: { id: true, email: true, name: true } },
      },
    });

    const assetIds = [...new Set(flags.map((f) => f.assetId))];
    const assets = assetIds.length
      ? await prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, title: true, type: true, status: true, orgId: true },
        })
      : [];
    const assetMap = Object.fromEntries(assets.map((a) => [a.id, a]));

    return {
      success: true,
      flags: flags.map((f) => ({
        ...f,
        asset: assetMap[f.assetId] || null,
      })),
    };
  } catch (error) {
    console.error('listModerationFlags error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list moderation flags',
      statusCode: 500,
    });
  }
}

async function createModerationFlag(request, reply) {
  try {
    const { assetId, reason, notes } = request.body || {};
    if (!assetId || !reason) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'assetId and reason are required',
        statusCode: 400,
      });
    }

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Asset not found',
        statusCode: 404,
      });
    }

    const flag = await prisma.platformModerationFlag.create({
      data: {
        assetId,
        orgId: asset.orgId,
        reason: String(reason),
        notes: notes || null,
        flaggedById: request.platformAdmin.id,
        status: 'open',
      },
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.MODERATION_FLAG_CREATED,
      description: `Flagged asset ${assetId}: ${reason}`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: asset.orgId,
    });

    return reply.status(201).send({ success: true, flag });
  } catch (error) {
    console.error('createModerationFlag error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to create flag',
      statusCode: 500,
    });
  }
}

async function updateModerationFlag(request, reply) {
  try {
    const { flagId } = request.params;
    const { status, notes } = request.body || {};
    const data = {};
    if (status) {
      if (!['open', 'quarantined', 'resolved', 'dismissed'].includes(status)) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Invalid status',
          statusCode: 400,
        });
      }
      data.status = status;
      if (status === 'resolved' || status === 'dismissed') {
        data.resolvedAt = new Date();
      }
    }
    if (notes !== undefined) data.notes = notes;

    const flag = await prisma.platformModerationFlag.update({
      where: { id: flagId },
      data,
    });

    if (status === 'quarantined') {
      await prisma.asset.update({
        where: { id: flag.assetId },
        data: { status: 'archived' },
      }).catch(() => null);
    }

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.MODERATION_FLAG_UPDATED,
      description: `Flag ${flagId} → ${status || 'updated'}`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: flag.orgId,
    });

    return { success: true, flag };
  } catch (error) {
    console.error('updateModerationFlag error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update flag',
      statusCode: 500,
    });
  }
}

async function searchMediaMatrix(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();
    const orgId = request.query?.orgId ? String(request.query.orgId) : undefined;
    const type = request.query?.type ? String(request.query.type) : undefined;

    const assets = await prisma.asset.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        ...(type ? { type } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { id: { equals: q.length === 36 ? q : undefined } },
              ].filter((clause) => {
                if (clause.id && clause.id.equals === undefined) return false;
                return true;
              }),
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        orgId: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        uploadedBy: { select: { id: true, email: true, name: true } },
      },
    });

    return { success: true, assets };
  } catch (error) {
    console.error('searchMediaMatrix error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Media search failed',
      statusCode: 500,
    });
  }
}

async function forceDeleteAsset(request, reply) {
  try {
    const { assetId } = request.params;
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Asset not found',
        statusCode: 404,
      });
    }

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'trash',
        deletedAt: new Date(),
        deletionReason: `Platform force-delete by ${request.platformAdmin.email}`,
      },
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.ASSET_FORCE_DELETED,
      description: `Force-deleted asset ${asset.title} (${assetId})`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: asset.orgId,
    });

    return { success: true };
  } catch (error) {
    console.error('forceDeleteAsset error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Force delete failed',
      statusCode: 500,
    });
  }
}

module.exports = {
  listModerationFlags,
  createModerationFlag,
  updateModerationFlag,
  searchMediaMatrix,
  forceDeleteAsset,
};
