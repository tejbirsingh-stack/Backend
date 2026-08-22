const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');

function serializePlan(plan) {
  if (!plan) return null;
  return {
    ...plan,
    slug: plan.id,
    annualPriceCents: plan.yearlyPriceCents,
    storageQuotaBytes: plan.storageQuotaBytes?.toString?.() ?? String(plan.storageQuotaBytes ?? 0),
    features: Array.isArray(plan.features) ? plan.features : plan.features || [],
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
  if (body.features !== undefined) data.features = body.features;
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
    const id = String(body.id || body.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
    const data = parsePlanBody(body);
    if (!id || !data.name) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'id/slug and name are required',
        statusCode: 400,
      });
    }
    if (data.storageQuotaBytes === undefined) data.storageQuotaBytes = BigInt(5 * 1024 ** 3);
    if (data.features === undefined) data.features = [];
    if (data.isActive === undefined) data.isActive = true;

    const plan = await prisma.plan.create({ data: { id, ...data } });
    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLAN_CREATED,
      description: `Created plan ${plan.name} (${plan.id})`,
      activityType: ACTIVITY_TYPE.INFO,
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
    const data = parsePlanBody(request.body);
    const plan = await prisma.plan.update({
      where: { id: planId },
      data,
    });
    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLAN_UPDATED,
      description: `Updated plan ${plan.name} (${plan.id})`,
      activityType: ACTIVITY_TYPE.INFO,
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
    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLAN_DELETED,
      description: `Deleted plan ${plan.name} (${plan.id})`,
      activityType: ACTIVITY_TYPE.INFO,
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
