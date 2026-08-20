const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');
const stripeService = require('../services/stripe.service');

function serializePlan(plan) {
  if (!plan) return null;
  return {
    ...plan,
    slug: plan.id,
    annualPriceCents: plan.yearlyPriceCents,
    storageQuotaBytes: plan.storageQuotaBytes?.toString?.() ?? String(plan.storageQuotaBytes ?? 0),
    showProjectQuota: plan.showProjectQuota ?? true,
    showStorageQuota: plan.showStorageQuota ?? true,
    showMemberQuota: plan.showMemberQuota ?? true,
    // Expose features as a flat array of feature objects { id, name, sortOrder }
    features: (plan.featureSelections || []).map((sel) => sel.feature).filter(Boolean),
  };
}

function parsePlanBody(body = {}) {
  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = body.description;
  if (body.monthlyPriceCents !== undefined) data.monthlyPriceCents = parseInt(body.monthlyPriceCents, 10) || 0;
  if (body.yearlyPriceCents !== undefined || body.annualPriceCents !== undefined) {
    data.yearlyPriceCents = parseInt(body.yearlyPriceCents ?? body.annualPriceCents, 10) || 0;
  }
  if (body.storageQuotaBytes !== undefined) data.storageQuotaBytes = BigInt(body.storageQuotaBytes);
  if (body.maxUsers !== undefined) data.maxUsers = parseInt(body.maxUsers, 10) || 1;
  if (body.maxWorkspaces !== undefined) data.maxWorkspaces = parseInt(body.maxWorkspaces, 10) || 1;
  if (body.maxProjects !== undefined) data.maxProjects = parseInt(body.maxProjects, 10) || 1;
  if (body.showProjectQuota !== undefined) data.showProjectQuota = Boolean(body.showProjectQuota);
  if (body.showStorageQuota !== undefined) data.showStorageQuota = Boolean(body.showStorageQuota);
  if (body.showMemberQuota !== undefined) data.showMemberQuota = Boolean(body.showMemberQuota);
  // featureIds replaces the old features JsonB field
  // We handle feature syncing separately in create/update
  if (body.monthlyPriceId !== undefined || body.stripeMonthlyPriceId !== undefined) {
    data.monthlyPriceId = body.monthlyPriceId ?? body.stripeMonthlyPriceId ?? null;
  }
  if (body.yearlyPriceId !== undefined || body.stripeAnnualPriceId !== undefined) {
    data.yearlyPriceId = body.yearlyPriceId ?? body.stripeAnnualPriceId ?? null;
  }
  if (body.isPublic !== undefined) data.isPublic = Boolean(body.isPublic);
  if (body.isFeatured !== undefined) data.isFeatured = Boolean(body.isFeatured);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined) data.sortOrder = parseInt(body.sortOrder, 10) || 0;
  if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel;
  return data;
}

async function listPlans(request, reply) {
  try {
    const publicOnly = request.query?.public === 'true';
    const plans = await prisma.plan.findMany({
      where: publicOnly ? { isPublic: true, isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        featureSelections: {
          include: { feature: true },
          orderBy: { feature: { sortOrder: 'asc' } },
        },
      },
    });
    return { success: true, plans: plans.map(serializePlan) };
  } catch (error) {
    console.error('listPlans error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list plans',
      statusCode: 500,
    });
  }
}

async function createPlan(request, reply) {
  try {
    const body = request.body || {};
    // Let Prisma auto-generate a UUID if an ID isn't explicitly provided
    const explicitId = body.id && body.id.trim() !== '' ? body.id.trim() : null;
    const data = parsePlanBody(body);
    if (!data.name) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'name is required',
        statusCode: 400,
      });
    }
    if (data.storageQuotaBytes === undefined) data.storageQuotaBytes = BigInt(5 * 1024 ** 3);
    if (data.isActive === undefined) data.isActive = true;

    // Extract featureIds before creating plan
    const featureIds = Array.isArray(body.featureIds) ? body.featureIds : [];

    const createData = { ...data };
    if (explicitId) {
      createData.id = explicitId;
    }
    if (featureIds.length > 0) {
      createData.featureSelections = { create: featureIds.map((featureId) => ({ featureId })) };
    }

    let plan = await prisma.plan.create({
      data: createData,
      include: {
        featureSelections: {
          include: { feature: true },
          orderBy: { feature: { sortOrder: 'asc' } },
        },
      },
    });
    
    // Sync to Stripe
    try {
      const stripeSync = await stripeService.syncPlanToStripe(plan);
      if (stripeSync.monthlyPriceId || stripeSync.yearlyPriceId) {
        plan = await prisma.plan.update({
          where: { id: plan.id },
          data: {
            monthlyPriceId: stripeSync.monthlyPriceId,
            yearlyPriceId: stripeSync.yearlyPriceId
          },
          include: {
            featureSelections: {
              include: { feature: true },
              orderBy: { feature: { sortOrder: 'asc' } },
            },
          },
        });
      }
    } catch (stripeErr) {
      console.error('[Stripe Sync Error] Failed during plan creation:', stripeErr.message);
    }

    await writePlatformAudit({
      activityName: 'Plan created',
      description: `Created plan ${plan.name} (${plan.id})`,
      activityType: 'plan',
      admin: request.platformAdmin,
    });
    return reply.status(201).send({ success: true, plan: serializePlan(plan) });
  } catch (error) {
    console.error('createPlan error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to create plan',
      statusCode: 500,
    });
  }
}

async function updatePlan(request, reply) {
  try {
    const { planId } = request.params;
    const body = request.body || {};
    const data = parsePlanBody(body);
    
    const existingPlan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        featureSelections: { include: { feature: true } },
      },
    });
    if (!existingPlan) {
      return reply.status(404).send({ error: 'NotFound', message: 'Plan not found', statusCode: 404 });
    }

    const mergedPlan = { ...existingPlan, ...data };
    try {
      const stripeSync = await stripeService.syncPlanToStripe(mergedPlan);
      data.monthlyPriceId = stripeSync.monthlyPriceId;
      data.yearlyPriceId = stripeSync.yearlyPriceId;
    } catch (stripeErr) {
      console.error('[Stripe Sync Error] Failed during plan update:', stripeErr.message);
    }

    // Sync featureSelections if featureIds provided
    const featureIds = Array.isArray(body.featureIds) ? body.featureIds : null;

    const plan = await prisma.plan.update({
      where: { id: planId },
      data: {
        ...data,
        ...(featureIds !== null && {
          featureSelections: {
            deleteMany: {},
            create: featureIds.map((featureId) => ({ featureId })),
          },
        }),
      },
      include: {
        featureSelections: {
          include: { feature: true },
          orderBy: { feature: { sortOrder: 'asc' } },
        },
      },
    });
    await writePlatformAudit({
      activityName: 'Plan updated',
      description: `Updated plan ${plan.name} (${plan.id})`,
      activityType: 'plan',
      admin: request.platformAdmin,
    });
    return { success: true, plan: serializePlan(plan) };
  } catch (error) {
    console.error('updatePlan error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update plan',
      statusCode: 500,
    });
  }
}

async function deletePlan(request, reply) {
  try {
    const { planId } = request.params;
    const inUse = await prisma.organization.count({ where: { currentPlanId: planId } });
    if (inUse > 0) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Plan is assigned to organizations. Reassign them first.',
        statusCode: 409,
      });
    }
    const plan = await prisma.plan.delete({ where: { id: planId } });

    // Attempt to archive the plan in Stripe so it disappears from the active catalogue
    try {
      await stripeService.archivePlanInStripe(planId);
    } catch (stripeErr) {
      console.error('[Stripe Sync Error] Failed to archive plan in Stripe upon deletion:', stripeErr.message);
    }

    await writePlatformAudit({
      activityName: 'Plan deleted',
      description: `Deleted plan ${plan.name} (${plan.id})`,
      activityType: 'plan',
      admin: request.platformAdmin,
    });
    return { success: true };
  } catch (error) {
    console.error('deletePlan error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to delete plan',
      statusCode: 500,
    });
  }
}

async function listPublicPlans(_request, reply) {
  try {
    const plans = await prisma.plan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        featureSelections: {
          where: { feature: { isActive: true } },
          include: { feature: true },
          orderBy: { feature: { sortOrder: 'asc' } },
        },
      },
    });
    return { success: true, plans: plans.map(serializePlan) };
  } catch (error) {
    console.error('listPublicPlans error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load plans',
      statusCode: 500,
    });
  }
}

module.exports = {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listPublicPlans,
};
