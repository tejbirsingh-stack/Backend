const prisma = require('../utils/prisma');

async function listPlatformActivity(request, reply) {
  try {
    const orgId = request.query?.orgId ? String(request.query.orgId) : undefined;
    const activityType = request.query?.activityType
      ? String(request.query.activityType)
      : undefined;
    const actorType = request.query?.actorType ? String(request.query.actorType) : undefined;
    const q = String(request.query?.q || '').trim();
    const take = Math.min(parseInt(request.query?.limit || '100', 10) || 100, 500);

    const logs = await prisma.auditLog.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { orgId } : {}),
        ...(activityType ? { activityType } : {}),
        ...(actorType ? { actorType } : {}),
        ...(q
          ? {
              OR: [
                { activityName: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { userEmail: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return { success: true, activities: logs };
  } catch (error) {
    console.error('listPlatformActivity error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load activity',
      statusCode: 500,
    });
  }
}

async function getReportingSummary(_request, reply) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [orgsByPlan, allPlans, newOrgs, storageAgg, loginEvents] = await Promise.all([
      prisma.organization.groupBy({
        by: ['currentPlanId'],
        _count: { _all: true },
      }),
      prisma.plan.findMany(),
      prisma.organization.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.organization.aggregate({
        _sum: { storageUsedBytes: true },
      }),
      prisma.auditLog.count({
        where: {
          activityName: { contains: 'login', mode: 'insensitive' },
          createdAt: { gte: thirtyDaysAgo },
          deletedAt: null,
        },
      }),
    ]);

    const planMap = new Map(allPlans.map((p) => [p.id, p.name.toLowerCase()]));

    return {
      success: true,
      report: {
        periodDays: 30,
        newOrganizations: newOrgs,
        loginEvents,
        planConversion: orgsByPlan.map((row) => ({
          planType: row.currentPlanId ? (planMap.get(row.currentPlanId) || 'free') : 'free',
          count: row._count._all,
        })),
        storageUsedBytes: (storageAgg._sum.storageUsedBytes || 0n).toString(),
      },
    };
  } catch (error) {
    console.error('getReportingSummary error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load report',
      statusCode: 500,
    });
  }
}

module.exports = {
  listPlatformActivity,
  getReportingSummary,
};
