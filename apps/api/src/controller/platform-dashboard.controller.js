const prisma = require('../utils/prisma');

function serializeBigInt(value) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

async function getDashboardSummary(_request, reply) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      totalUsers,
      activeUsers,
      suspendedUsers,
      inactiveUsers,
      totalWorkspaces,
      totalProjects,
      totalAssets,
      openFlags,
      storageAgg,
      planGroups,
      roleGroups,
      allPlans,
      recentOrgs,
      recentAudit,
      newOrgs30d,
      newUsers30d,
      mrrOrgs,
      catalogPlanCount,
      attentionCandidates,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: 'active' } }),
      prisma.organization.count({ where: { status: 'suspended' } }),
      prisma.user.count(),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: 'suspended' } }),
      prisma.user.count({ where: { status: 'inactive' } }),
      prisma.workspace.count(),
      prisma.project.count(),
      prisma.asset.count({ where: { deletedAt: null } }),
      prisma.platformModerationFlag.count({
        where: { status: { in: ['open', 'quarantined'] } },
      }),
      prisma.organization.aggregate({
        _sum: { storageUsedBytes: true },
      }),
      prisma.organization.groupBy({
        by: ['currentPlanId'],
        _count: { _all: true },
      }),
      prisma.user.groupBy({
        by: ['roleId'],
        _count: { _all: true },
      }),
      prisma.plan.findMany(),
      prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          currentPlan: true,
          _count: { select: { users: true, workspaces: true, assets: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          userRole: 'Platform Admin',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.organization.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.organization.findMany({
        where: { currentPlanId: { not: null }, status: 'active' },
        include: { currentPlan: { select: { monthlyPriceCents: true } } },
      }),
      prisma.plan.count({ where: { isPublic: true } }),
      prisma.organization.findMany({
        where: {
          OR: [{ status: 'suspended' }, { storageUsedBytes: { gt: 0 } }],
        },
        orderBy: { storageUsedBytes: 'desc' },
        take: 40,
        include: {
          currentPlan: true,
          _count: { select: { users: true, workspaces: true, assets: true } },
        },
      }),
    ]);

    const roleIds = roleGroups.map((r) => r.roleId).filter(Boolean);
    const roles = roleIds.length
      ? await prisma.role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, name: true },
        })
      : [];
    const roleNameById = Object.fromEntries(roles.map((r) => [r.id, r.name]));

    const usersByRole = roleGroups
      .map((row) => ({
        roleId: row.roleId,
        roleName: row.roleId ? roleNameById[row.roleId] || 'Unknown' : 'Unassigned',
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    let estimatedMrrCents = 0;
    for (const org of mrrOrgs) {
      estimatedMrrCents += org.currentPlan?.monthlyPriceCents || 0;
    }

    const storageUsedBytes = storageAgg._sum.storageUsedBytes || 0n;
    let storageQuotaBytes = 0n;
    
    // Find the default free plan to use as a fallback for orgs without a plan (currentPlanId = null)
    const fallbackFreePlan = allPlans.find(p => p.name.toLowerCase().includes('free') || p.monthlyPriceCents === 0);

    for (const row of planGroups) {
      const plan = row.currentPlanId ? allPlans.find((p) => p.id === row.currentPlanId) : fallbackFreePlan;
      if (plan?.storageQuotaBytes) {
        storageQuotaBytes += BigInt(plan.storageQuotaBytes) * BigInt(row._count._all);
      }
    }

    const planMap = new Map(allPlans.map((p) => [p.id, p.name.toLowerCase()]));
    
    // Group by the normalized string name so nulls and 'Free' plans combine into a single slice
    const planMixAgg = {};
    for (const row of planGroups) {
      const planType = row.currentPlanId ? (planMap.get(row.currentPlanId) || 'free') : 'free';
      planMixAgg[planType] = (planMixAgg[planType] || 0) + row._count._all;
    }
    
    const planMix = Object.entries(planMixAgg)
      .map(([planType, count]) => ({ planType, count }))
      .sort((a, b) => b.count - a.count);

    const orgQuotaBytes = (org) => {
      if (org.currentPlan?.storageQuotaBytes) return org.currentPlan.storageQuotaBytes;
      if (fallbackFreePlan?.storageQuotaBytes) return fallbackFreePlan.storageQuotaBytes;
      return 0n;
    };

    const attentionOrgs = attentionCandidates
      .filter((org) => {
        const used = Number(org.storageUsedBytes || 0);
        const quota = Number(orgQuotaBytes(org));
        const storageHot = quota > 0 && used / quota >= 0.8;
        return org.status === 'suspended' || storageHot;
      })
      .slice(0, 6);

    return {
      success: true,
      summary: {
        totalOrgs,
        activeOrgs,
        suspendedOrgs,
        totalUsers,
        activeUsers,
        suspendedUsers,
        inactiveUsers,
        totalWorkspaces,
        totalProjects,
        totalAssets,
        openModerationFlags: openFlags,
        storageUsedBytes: serializeBigInt(storageUsedBytes),
        storageQuotaBytes: serializeBigInt(storageQuotaBytes),
        storageUtilizationPercent:
          storageQuotaBytes > 0n
            ? Number((storageUsedBytes * 10000n) / storageQuotaBytes) / 100
            : 0,
        planMix,
        usersByRole,
        recentOrgs: recentOrgs.map((org) => ({
          ...org,
          planType: org.currentPlan?.name ? org.currentPlan.name.toLowerCase() : 'free',
          storageUsedBytes: serializeBigInt(org.storageUsedBytes),
          storageQuotaBytes: serializeBigInt(orgQuotaBytes(org)),
        })),
        attentionOrgs: attentionOrgs.map((org) => ({
          ...org,
          planType: org.currentPlan?.name ? org.currentPlan.name.toLowerCase() : 'free',
          storageUsedBytes: serializeBigInt(org.storageUsedBytes),
          storageQuotaBytes: serializeBigInt(orgQuotaBytes(org)),
        })),
        recentActivity: recentAudit,
        growth: {
          newOrganizations30d: newOrgs30d,
          newUsers30d: newUsers30d,
        },
        commercial: {
          estimatedMrrCents,
          catalogPlanCount,
        },
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
