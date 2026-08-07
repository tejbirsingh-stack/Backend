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
      recentOrgs,
      recentAudit,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: 'active' } }),
      prisma.organization.count({ where: { status: 'suspended' } }),
      prisma.user.count(),
      prisma.organization.aggregate({
        _sum: { storageUsedBytes: true, storageQuotaBytes: true },
      }),
      prisma.organization.groupBy({
        by: ['planType'],
        _count: { _all: true },
      }),
      prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          name: true,
          slug: true,
          planType: true,
          status: true,
          createdAt: true,
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

    const planMix = planGroups.map((row) => ({
      planType: row.planType,
      count: row._count._all,
    }));

    return {
      success: true,
      summary: {
        totalOrgs,
        activeOrgs,
        suspendedOrgs,
        totalUsers,
        storageUsedBytes: serializeBigInt(storageAgg._sum.storageUsedBytes || 0n),
        storageQuotaBytes: serializeBigInt(storageAgg._sum.storageQuotaBytes || 0n),
        planMix,
        recentOrgs,
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
