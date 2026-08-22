const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');

/**
 * Platform billing overview — Phase 2 surface.
 * Uses Organization subscription fields; Stripe webhook sync can populate later.
 */
async function getBillingOverview(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();

    const [byStatus, mrrEstimate] = await Promise.all([
      prisma.organization.groupBy({
        by: ['subscriptionStatus'],
        _count: { _all: true },
      }),
      prisma.plan.findMany({ where: { isPublic: true } }),
    ]);

    const orgsWithPlans = await prisma.organization.findMany({
      where: { currentPlanId: { not: null }, status: 'active' },
      include: { currentPlan: true },
    });

    let mrrCents = 0;
    for (const org of orgsWithPlans) {
      mrrCents += org.currentPlan?.monthlyPriceCents || 0;
    }

    const subscriptions = await prisma.organization.findMany({
      where: {
        AND: [
          {
            OR: [
              { stripeCustomerId: { not: null } },
              { subscriptionStatus: { not: null } },
              { currentPlan: { name: { notIn: ['free', 'Free'] } } },
            ],
          },
          ...(q
            ? [
                {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { slug: { contains: q, mode: 'insensitive' } },
                    { stripeCustomerId: { contains: q, mode: 'insensitive' } },
                    { planType: { contains: q, mode: 'insensitive' } },
                    { subscriptionStatus: { contains: q, mode: 'insensitive' } },
                    { currentPlan: { name: { contains: q, mode: 'insensitive' } } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        currentPlan: true,
        _count: { select: { users: true } },
      },
    });

    return {
      success: true,
      billing: {
        subscriptionStatusCounts: byStatus.map((row) => ({
          status: row.subscriptionStatus || 'none',
          count: row._count._all,
        })),
        estimatedMrrCents: mrrCents,
        catalogPlanCount: mrrEstimate.length,
        subscriptions: subscriptions.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          planType: org.currentPlan?.name ? org.currentPlan.name.toLowerCase() : 'free',
          status: org.status,
          subscriptionStatus: org.subscriptionStatus,
          stripeCustomerId: org.stripeCustomerId,
          userCount: org._count.users,
          plan: org.currentPlan
            ? {
                id: org.currentPlan.id,
                name: org.currentPlan.name,
                monthlyPriceCents: org.currentPlan.monthlyPriceCents,
              }
            : null,
          updatedAt: org.updatedAt,
        })),
      },
    };
  } catch (error) {
    console.error('getBillingOverview error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load billing overview',
      statusCode: 500,
    });
  }
}

async function overrideSubscription(request, reply) {
  try {
    const { orgId } = request.params;
    const { subscriptionStatus, stripeCustomerId, currentPlanId } = request.body || {};
    const data = {};
    if (subscriptionStatus !== undefined) data.subscriptionStatus = subscriptionStatus;
    if (stripeCustomerId !== undefined) data.stripeCustomerId = stripeCustomerId;
    if (currentPlanId !== undefined) {
      data.currentPlanId = currentPlanId || null;
    }

    const org = await prisma.organization.update({
      where: { id: orgId },
      data,
      include: { currentPlan: true },
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.SUBSCRIPTION_OVERRIDE,
      description: `Manual billing override for ${org.name}`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: org.id,
    });

    const currentPlan = org.currentPlan || {};
    return {
      success: true,
      organization: {
        ...org,
        planType: currentPlan.name ? currentPlan.name.toLowerCase() : 'free',
        storageQuotaBytes: (currentPlan.storageQuotaBytes || 0n).toString(),
        storageUsedBytes: org.storageUsedBytes?.toString?.() ?? '0',
        maxUsers: currentPlan.maxUsers ?? 5,
        maxWorkspaces: currentPlan.maxWorkspaces ?? 1,
        maxProjects: currentPlan.maxProjects ?? 1,
        features: currentPlan.features ?? [],
      },
    };
  } catch (error) {
    console.error('overrideSubscription error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to override subscription',
      statusCode: 500,
    });
  }
}

async function getUsageOverview(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();
    const status = request.query?.status ? String(request.query.status) : undefined;
    const planId = request.query?.planId ? String(request.query.planId) : undefined;
    const subscriptionStatus = request.query?.subscriptionStatus ? String(request.query.subscriptionStatus) : undefined;
    const minStorageBytes = request.query?.minStorageBytes ? String(request.query.minStorageBytes) : undefined;
    const maxStorageBytes = request.query?.maxStorageBytes ? String(request.query.maxStorageBytes) : undefined;

    const limit = Math.min(parseInt(request.query?.limit || '50', 10) || 50, 200);
    const offset = parseInt(request.query?.offset || '0', 10) || 0;
    const sortBy = request.query?.sortBy ? String(request.query.sortBy) : 'storageUsedBytes';
    const sortDir = request.query?.sortDir === 'asc' ? 'asc' : 'desc';

    const where = {
      ...(status ? { status } : {}),
      ...(planId ? (planId === 'none' ? { currentPlanId: null } : { currentPlanId: planId }) : {}),
      ...(subscriptionStatus ? (subscriptionStatus === 'none' ? { subscriptionStatus: null } : { subscriptionStatus }) : {}),
      ...(minStorageBytes || maxStorageBytes
        ? {
            storageUsedBytes: {
              ...(minStorageBytes ? { gte: BigInt(minStorageBytes) } : {}),
              ...(maxStorageBytes ? { lte: BigInt(maxStorageBytes) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { currentPlan: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    let orderBy = { storageUsedBytes: sortDir };
    if (sortBy === 'name') orderBy = { name: sortDir };
    else if (sortBy === 'status') orderBy = { status: sortDir };
    else if (sortBy === 'plan') orderBy = { currentPlan: { name: sortDir } };

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          currentPlan: true,
          _count: { select: { users: true, assets: true, workspaces: true } },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return {
      success: true,
      total,
      usage: orgs.map((org) => {
        const currentPlan = org.currentPlan || {};
        return {
          ...org,
          planType: currentPlan.name ? currentPlan.name.toLowerCase() : 'free',
          storageUsedBytes: org.storageUsedBytes?.toString?.() ?? '0',
          storageQuotaBytes: (currentPlan.storageQuotaBytes || 0n).toString(),
          maxUsers: currentPlan.maxUsers ?? 5,
          usersUsed: org._count.users,
          assetsCount: org._count.assets,
          workspacesCount: org._count.workspaces,
        };
      }),
    };
  } catch (error) {
    console.error('getUsageOverview error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load usage',
      statusCode: 500,
    });
  }
}

module.exports = {
  getBillingOverview,
  overrideSubscription,
  getUsageOverview,
};
