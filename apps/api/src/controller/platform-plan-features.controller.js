const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');

/**
 * GET /platform/plan-features
 * Returns all active features from the catalog (admin).
 * GET /platform/catalog/plan-features
 * Returns only active features (public-facing, for pricing page).
 */
async function listPlanFeatures(request, reply) {
  try {
    const adminMode = !request.query?.public;
    const features = await prisma.planFeature.findMany({
      where: adminMode ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { success: true, features };
  } catch (error) {
    console.error('listPlanFeatures error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list plan features',
      statusCode: 500,
    });
  }
}

/**
 * POST /platform/plan-features
 * Create a new feature option in the catalog.
 */
async function createPlanFeature(request, reply) {
  try {
    const { name, description, sortOrder } = request.body || {};
    if (!name?.trim()) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'name is required',
        statusCode: 400,
      });
    }
    const feature = await prisma.planFeature.create({
      data: {
        name: String(name).trim(),
        description: description || null,
        sortOrder: parseInt(sortOrder, 10) || 0,
        isActive: true,
      },
    });
    await writePlatformAudit({
      activityName: 'Plan feature created',
      description: `Created plan feature "${feature.name}" (${feature.id})`,
      activityType: 'plan',
      admin: request.platformAdmin,
    });
    return reply.status(201).send({ success: true, feature });
  } catch (error) {
    if (error.code === 'P2002') {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'A feature with this name already exists',
        statusCode: 409,
      });
    }
    console.error('createPlanFeature error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to create plan feature',
      statusCode: 500,
    });
  }
}

/**
 * PATCH /platform/plan-features/:featureId
 * Rename, reorder, or toggle a feature.
 */
async function updatePlanFeature(request, reply) {
  try {
    const { featureId } = request.params;
    const { name, description, sortOrder, isActive } = request.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description;
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder, 10) || 0;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const feature = await prisma.planFeature.update({
      where: { id: featureId },
      data,
    });
    await writePlatformAudit({
      activityName: 'Plan feature updated',
      description: `Updated plan feature "${feature.name}" (${feature.id})`,
      activityType: 'plan',
      admin: request.platformAdmin,
    });
    return { success: true, feature };
  } catch (error) {
    console.error('updatePlanFeature error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update plan feature',
      statusCode: 500,
    });
  }
}

/**
 * DELETE /platform/plan-features/:featureId
 * Hard-deletes a plan feature from the database.
 */
async function deletePlanFeature(request, reply) {
  try {
    const { featureId } = request.params;
    const feature = await prisma.planFeature.delete({
      where: { id: featureId },
    });
    await writePlatformAudit({
      activityName: 'Plan feature deleted',
      description: `Deleted plan feature "${feature.name}" (${feature.id})`,
      activityType: 'plan',
      admin: request.platformAdmin,
    });
    return { success: true };
  } catch (error) {
    console.error('deletePlanFeature error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to delete plan feature',
      statusCode: 500,
    });
  }
}

module.exports = {
  listPlanFeatures,
  createPlanFeature,
  updatePlanFeature,
  deletePlanFeature,
};
