const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');

/**
 * Platform billing overview — Phase 2 surface.
 * Uses Organization subscription fields; Stripe webhook sync can populate later.
 */
async function getBillingOverview(_request, reply) {
  try {
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
        OR: [
          { stripeCustomerId: { not: null } },
          { subscriptionStatus: { not: null } },
          { currentPlan: { name: { notIn: ['free', 'Free'] } } },
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
      activityName: 'Subscription override',
      description: `Manual billing override for ${org.name}`,
      activityType: 'billing',
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

async function getUsageOverview(_request, reply) {
  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { storageUsedBytes: 'desc' },
      take: 50,
      include: {
        currentPlan: true,
        _count: { select: { users: true, assets: true, workspaces: true } },
      },
    });

    return {
      success: true,
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
