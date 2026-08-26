const prisma = require('../utils/prisma');

const REPORT_TYPES = ['growth', 'organizations', 'users', 'usage', 'activity'];

function parseReportFilters(query = {}) {
  const periodDays = Math.min(
    Math.max(parseInt(String(query.periodDays || '30'), 10) || 30, 1),
    365,
  );

  let from = query.from ? new Date(String(query.from)) : null;
  let to = query.to ? new Date(String(query.to)) : null;

  if (from && Number.isNaN(from.getTime())) from = null;
  if (to && Number.isNaN(to.getTime())) to = null;

  if (!from && !to) {
    to = new Date();
    from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  } else if (from && !to) {
    to = new Date();
  } else if (!from && to) {
    from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1000);
  }

  const status = query.status ? String(query.status) : undefined;
  const planType = query.planType ? String(query.planType) : undefined;
  const orgId = query.orgId ? String(query.orgId) : undefined;

  const effectiveDays = Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return { from, to, status, planType, orgId, periodDays: effectiveDays };
}

function orgWhere(filters) {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.planType ? { currentPlanId: filters.planType } : {}),
    ...(filters.orgId ? { id: filters.orgId } : {}),
  };
}

function parseSelectedReports(query = {}) {
  const raw = String(query.reports || 'growth').trim();
  const selected = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => REPORT_TYPES.includes(value));
  return selected.length > 0 ? [...new Set(selected)] : ['growth'];
}

async function listPlatformActivity(request, reply) {
  try {
    const orgId = request.query?.orgId ? String(request.query.orgId) : undefined;
    const activityType = request.query?.activityType
      ? String(request.query.activityType)
      : undefined;
    const actorType = request.query?.actorType ? String(request.query.actorType) : undefined;
    const userRole = request.query?.userRole ? String(request.query.userRole) : undefined;
    const q = String(request.query?.q || '').trim();
    const take = Math.min(parseInt(request.query?.limit || '100', 10) || 100, 500);
    const skip = parseInt(request.query?.offset || '0', 10) || 0;
    const hasDateFilter = Boolean(
      request.query?.from || request.query?.to || request.query?.periodDays,
    );
    const filters = hasDateFilter ? parseReportFilters(request.query || {}) : null;

    const sortBy = request.query?.sortBy ? String(request.query.sortBy) : 'createdAt';
    const sortDir = String(request.query?.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    let orderBy = { createdAt: sortDir };
    if (sortBy === 'activityName') orderBy = { activityName: sortDir };
    else if (sortBy === 'description') orderBy = { description: sortDir };
    else if (sortBy === 'activityType') orderBy = { activityType: sortDir };
    else if (sortBy === 'userEmail') orderBy = { userEmail: sortDir };
    else if (sortBy === 'actorType') orderBy = { actorType: sortDir };
    else if (sortBy === 'userRole') orderBy = { userRole: sortDir };
    else if (sortBy === 'organization') orderBy = { organization: { name: sortDir } };

    const where = {
      deletedAt: null,
      ...(filters ? { createdAt: { gte: filters.from, lte: filters.to } } : {}),
      ...(orgId ? { orgId } : {}),
      ...(activityType ? { activityType } : {}),
      ...(actorType ? { actorType } : {}),
      ...(userRole ? { userRole } : {}),
      ...(q
        ? {
            OR: [
              { activityName: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { userEmail: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { success: true, total, activities: logs };
  } catch (error) {
    console.error('listPlatformActivity error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load activity',
      statusCode: 500,
    });
  }
}

async function buildGrowthReport(filters) {
  const where = orgWhere(filters);

  const [orgsByPlan, newOrgs, storageAgg, loginEvents, suspendedOrgs, allPlans] = await Promise.all([
    prisma.organization.groupBy({
      by: ['currentPlanId'],
      where,
      _count: { _all: true },
    }),
    prisma.organization.count({
      where: {
        ...where,
        createdAt: { gte: filters.from, lte: filters.to },
      },
    }),
    prisma.organization.aggregate({
      where,
      _sum: { storageUsedBytes: true },
    }),
    prisma.auditLog.count({
      where: {
        activityName: { contains: 'login', mode: 'insensitive' },
        createdAt: { gte: filters.from, lte: filters.to },
        deletedAt: null,
        ...(filters.orgId ? { orgId: filters.orgId } : {}),
        ...(filters.status || filters.planType
          ? {
              organization: {
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.planType ? { currentPlanId: filters.planType } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.organization.count({
      where: { ...where, status: 'suspended' },
    }),
    prisma.plan.findMany(),
  ]);

  const planMap = new Map(allPlans.map((p) => [p.id, p.name]));

  let storageQuotaBytes = 0n;
  for (const row of orgsByPlan) {
    const plan = allPlans.find((p) => p.id === row.currentPlanId);
    if (plan?.storageQuotaBytes) {
      storageQuotaBytes += BigInt(plan.storageQuotaBytes) * BigInt(row._count._all);
    }
  }

  const planConversion = orgsByPlan.map((row) => ({
    planType: row.currentPlanId ? (planMap.get(row.currentPlanId) || row.currentPlanId) : 'Free',
    count: row._count._all,
  }));

  const storageUsedBytes = storageAgg._sum.storageUsedBytes || 0n;

  return {
    periodDays: filters.periodDays,
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    newOrganizations: newOrgs,
    loginEvents,
    suspendedOrganizations: suspendedOrgs,
    planConversion,
    storageUsedBytes: storageUsedBytes.toString(),
    storageQuotaBytes: storageQuotaBytes.toString(),
  };
}

async function buildOrganizationsReport(filters) {
  const orgs = await prisma.organization.findMany({
    where: orgWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      currentPlan: { select: { id: true, name: true, storageQuotaBytes: true } },
      _count: { select: { users: true, workspaces: true, assets: true } },
    },
  });

  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    planType: org.currentPlan?.name || 'Free',
    planName: org.currentPlan?.name || 'Free',
    users: org._count.users,
    workspaces: org._count.workspaces,
    assets: org._count.assets,
    storageUsedBytes: (org.storageUsedBytes || 0n).toString(),
    storageQuotaBytes: (org.currentPlan?.storageQuotaBytes || 0n).toString(),
    createdAt: org.createdAt.toISOString(),
  }));
}

async function buildUsersReport(filters) {
  const users = await prisma.user.findMany({
    where: {
      ...(filters.orgId ? { orgId: filters.orgId } : {}),
      ...(filters.status || filters.planType
        ? {
            organization: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.planType ? { currentPlanId: filters.planType } : {}),
              ...(filters.orgId ? { id: filters.orgId } : {}),
            },
          }
        : {}),
      createdAt: { lte: filters.to },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      jobTitle: true,
      lastLoginAt: true,
      createdAt: true,
      roleRelation: { select: { name: true } },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          currentPlan: { select: { name: true } },
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name || '',
    status: user.status,
    role: user.roleRelation?.name || '',
    jobTitle: user.jobTitle || '',
    organization: user.organization?.name || '',
    organizationSlug: user.organization?.slug || '',
    organizationStatus: user.organization?.status || '',
    planType: user.organization?.currentPlan?.name || '',
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : '',
    createdAt: user.createdAt.toISOString(),
  }));
}

async function buildUsageReport(filters) {
  const orgs = await prisma.organization.findMany({
    where: orgWhere(filters),
    orderBy: { storageUsedBytes: 'desc' },
    take: 500,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      storageUsedBytes: true,
      currentPlan: { select: { name: true, storageQuotaBytes: true, maxUsers: true } },
      _count: { select: { users: true, assets: true, workspaces: true } },
    },
  });

  return orgs.map((org) => {
    const used = Number(org.storageUsedBytes || 0n);
    const quota = Number(org.currentPlan?.storageQuotaBytes || 0n);
    const utilization =
      quota > 0 ? Math.round((used / quota) * 1000) / 10 : 0;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      planType: org.currentPlan?.name || '',
      usersUsed: org._count.users,
      maxUsers: org.currentPlan?.maxUsers ?? 0,
      workspaces: org._count.workspaces,
      assets: org._count.assets,
      storageUsedBytes: (org.storageUsedBytes || 0n).toString(),
      storageQuotaBytes: (org.currentPlan?.storageQuotaBytes || 0n).toString(),
      storageUtilizationPercent: utilization,
    };
  });
}

async function buildActivityReport(filters) {
  const logs = await prisma.auditLog.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: filters.from, lte: filters.to },
      ...(filters.orgId ? { orgId: filters.orgId } : {}),
      ...(filters.status || filters.planType
        ? {
            organization: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.planType ? { currentPlanId: filters.planType } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    activityName: log.activityName,
    activityType: log.activityType || '',
    description: log.description || '',
    actorType: log.actorType || '',
    userEmail: log.userEmail || '',
    userRole: log.userRole || '',
    organization: log.organization?.name || '',
    organizationSlug: log.organization?.slug || '',
  }));
}

async function getReportingSummary(request, reply) {
  try {
    const filters = parseReportFilters(request.query || {});
    const report = await buildGrowthReport(filters);
    return { success: true, report };
  } catch (error) {
    console.error('getReportingSummary error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load report',
      statusCode: 500,
    });
  }
}

async function exportPlatformReports(request, reply) {
  try {
    const filters = parseReportFilters(request.query || {});
    const selected = parseSelectedReports(request.query || {});
    const reports = {};

    await Promise.all(
      selected.map(async (type) => {
        if (type === 'growth') {
          reports.growth = await buildGrowthReport(filters);
        } else if (type === 'organizations') {
          reports.organizations = await buildOrganizationsReport(filters);
        } else if (type === 'users') {
          reports.users = await buildUsersReport(filters);
        } else if (type === 'usage') {
          reports.usage = await buildUsageReport(filters);
        } else if (type === 'activity') {
          reports.activity = await buildActivityReport(filters);
        }
      }),
    );

    return {
      success: true,
      filters: {
        from: filters.from.toISOString(),
        to: filters.to.toISOString(),
        periodDays: filters.periodDays,
        status: filters.status || null,
        planType: filters.planType || null,
        orgId: filters.orgId || null,
      },
      selectedReports: selected,
      reports,
    };
  } catch (error) {
    console.error('exportPlatformReports error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to export reports',
      statusCode: 500,
    });
  }
}

module.exports = {
  listPlatformActivity,
  getReportingSummary,
  exportPlatformReports,
  REPORT_TYPES,
};
