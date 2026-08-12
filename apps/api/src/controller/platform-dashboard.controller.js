const prisma = require('../utils/prisma');

function serializeBigInt(value) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

async function getDashboardSummary(_request, reply) {
  try {
    const [
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      totalUsers,
      storageAgg,
      planGroups,
      allPlans,
      recentOrgs,
      recentAudit,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: 'active' } }),
      prisma.organization.count({ where: { status: 'suspended' } }),
      prisma.user.count(),
      prisma.organization.aggregate({
        _sum: { storageUsedBytes: true },
      }),
      prisma.organization.groupBy({
        by: ['currentPlanId'],
        _count: { _all: true },
      }),
      prisma.plan.findMany(),
      prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          currentPlan: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { actorType: 'platform_admin' },
            { activityType: 'platform' },
          ],
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

    const planMap = new Map(allPlans.map((p) => [p.id, p.name.toLowerCase()]));
    const planMix = planGroups.map((row) => ({
      planType: row.currentPlanId ? (planMap.get(row.currentPlanId) || 'free') : 'free',
      count: row._count._all,
    }));

    let totalQuotaBytes = 0n;
    for (const org of recentOrgs) {
      if (org.currentPlan?.storageQuotaBytes) {
        totalQuotaBytes += BigInt(org.currentPlan.storageQuotaBytes);
      }
    }

    return {
      success: true,
      summary: {
        totalOrgs,
        activeOrgs,
        suspendedOrgs,
        totalUsers,
        storageUsedBytes: serializeBigInt(storageAgg._sum.storageUsedBytes || 0n),
        storageQuotaBytes: serializeBigInt(totalQuotaBytes),
        planMix,
        recentOrgs: recentOrgs.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          planType: org.currentPlan?.name ? org.currentPlan.name.toLowerCase() : 'free',
          status: org.status,
          createdAt: org.createdAt,
        })),
        recentActivity: recentAudit,
      },
    };
  } catch (error) {
    console.error('getDashboardSummary error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load dashboard',
      statusCode: 500,
    });
  }
}

module.exports = { getDashboardSummary };
