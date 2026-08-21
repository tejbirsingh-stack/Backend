const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');

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

    const sortBy = String(request.query?.sortBy || 'updatedAt');
    const sortDir = String(request.query?.sortDir || 'desc') === 'asc' ? 'asc' : 'desc';

    // Map frontend sort field names → Prisma orderBy clauses
    const SORT_MAP = {
      name: { name: sortDir },
      plan: { currentPlan: { name: sortDir } },
      subscriptionStatus: { subscriptionStatus: sortDir },
      users: { users: { _count: sortDir } },
      updatedAt: { updatedAt: sortDir },
      stripeCustomerId: { stripeCustomerId: sortDir },
    };
    const orderBy = SORT_MAP[sortBy] || { updatedAt: 'desc' };

    const statusFilter = request.query?.status;
    const planId = request.query?.planId;
    const subscriptionStatus = request.query?.subscriptionStatus;

    const limit = Math.min(Number(request.query?.limit || 50), 200);
    const offset = Number(request.query?.offset || 0);

    // When admin filters for 'active', also include orgs with a scheduled downgrade
    // (they're still active but their DB value may be 'canceling')
    const subscriptionStatusFilter = subscriptionStatus === 'active'
      ? { OR: [{ subscriptionStatus: 'active' }, { AND: [{ subscriptionStatus: 'canceling' }, { metadata: { path: ['isDowngradeScheduled'], equals: true } }] }] }
      : subscriptionStatus
        ? { subscriptionStatus }
        : null;

    const whereClause = {
      AND: [
        {
          OR: [
            { stripeCustomerId: { not: null } },
            { subscriptionStatus: { not: null } },
            { currentPlan: { name: { notIn: ['free', 'Free'] } } },
          ],
        },
        ...(statusFilter ? [{ status: statusFilter }] : []),
        ...(planId === 'none' ? [{ currentPlanId: null }] : planId ? [{ currentPlanId: planId }] : []),
        ...(subscriptionStatusFilter ? [subscriptionStatusFilter] : []),
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { slug: { contains: q, mode: 'insensitive' } },
                  { stripeCustomerId: { contains: q, mode: 'insensitive' } },
                  { subscriptionStatus: { contains: q, mode: 'insensitive' } },
                  { currentPlan: { name: { contains: q, mode: 'insensitive' } } },
                ],
              },
            ]
          : []),
      ],
    };

    const [subscriptions, total] = await Promise.all([
      prisma.organization.findMany({
        where: whereClause,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          currentPlan: true,
          _count: { select: { users: true } },
          users: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { email: true },
          },
        },
      }),
      prisma.organization.count({ where: whereClause }),
    ]);

    return {
      success: true,
      billing: {
        subscriptionStatusCounts: byStatus.map((row) => ({
          status: row.subscriptionStatus || 'none',
          count: row._count._all,
        })),
        estimatedMrrCents: mrrCents,
        catalogPlanCount: mrrEstimate.length,
        total,
        subscriptions: subscriptions.map((org) => {
          const meta = org.metadata || {};
          // If a downgrade is scheduled, the subscription is still active — override stale 'canceling' status
          const isDowngradeScheduled = meta.isDowngradeScheduled === true;
          const resolvedStatus = isDowngradeScheduled && org.subscriptionStatus === 'canceling'
            ? 'active'
            : org.subscriptionStatus;

          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            ownerEmail: org.users?.[0]?.email || org.slug,
            planType: org.currentPlan?.name ? org.currentPlan.name.toLowerCase() : 'free',
            status: org.status,
            subscriptionStatus: resolvedStatus,
            stripeCustomerId: org.stripeCustomerId,
            userCount: org._count.users,
            plan: org.currentPlan
              ? {
                  id: org.currentPlan.id,
                  name: org.currentPlan.name,
                  monthlyPriceCents: org.currentPlan.monthlyPriceCents,
                }
              : null,
            billingCycle: meta.billingCycle || null,
            scheduledDowngrade: isDowngradeScheduled
              ? {
                  planName: meta.scheduledPlanName || null,
                  billingCycle: meta.scheduledBillingCycle || null,
                  effectiveDate: org.planExpiresAt || null,
                }
              : null,
            updatedAt: org.updatedAt,
          };
        }),
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
async function getPlatformPaymentLogs(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();
    const limit = Math.min(parseInt(request.query?.limit) || 10, 100);
    const offset = parseInt(request.query?.offset) || 0;
    const status = request.query?.status || '';
    const orgId = request.query?.orgId || '';
    const createdFrom = request.query?.createdFrom || '';
    const createdTo = request.query?.createdTo || '';
    const sortBy = String(request.query?.sortBy || 'createdAt');
    const sortDir = String(request.query?.sortDir || 'desc') === 'asc' ? 'asc' : 'desc';

    const SORT_MAP = {
      org: { organization: { name: sortDir } },
      amount: { amountCents: sortDir },
      status: { status: sortDir },
      paymentId: { stripePaymentIntentId: sortDir },
      createdAt: { createdAt: sortDir },
    };
    const orderBy = SORT_MAP[sortBy] || { createdAt: 'desc' };

    const where = {};
    if (q) {
      where.OR = [
        { stripeCustomerId: { contains: q, mode: 'insensitive' } },
        { stripeSessionId: { contains: q, mode: 'insensitive' } },
        { stripePaymentIntentId: { contains: q, mode: 'insensitive' } },
        { organization: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (status) {
      where.status = { equals: status, mode: 'insensitive' };
    }
    if (orgId) {
      where.orgId = orgId;
    }
    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) where.createdAt.gte = new Date(createdFrom);
      if (createdTo) where.createdAt.lte = new Date(createdTo);
    }

    const [logs, total, failed30Days] = await Promise.all([
      prisma.paymentLog.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { events: true } },
          events: {
            where: { status: { equals: 'failed', mode: 'insensitive' } },
            select: { failureReason: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.paymentLog.count({ where }),
      prisma.paymentLog.count({
        where: {
          ...where,
          status: { equals: 'failed', mode: 'insensitive' },
          createdAt: where.createdAt || { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      success: true,
      logs,
      total,
      failed30Days,
    };
  } catch (error) {
    console.error('getPlatformPaymentLogs error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load payment logs',
      statusCode: 500,
    });
  }
}

async function getPaymentLogOrgs(_request, reply) {
  try {
    // Get distinct orgIds that have at least one payment log
    const rows = await prisma.paymentLog.findMany({
      where: { orgId: { not: null } },
      select: {
        orgId: true,
        organization: { select: { id: true, name: true } },
      },
      distinct: ['orgId'],
      orderBy: { createdAt: 'desc' },
    });

    const orgs = rows
      .filter((r) => r.organization)
      .map((r) => ({ id: r.organization.id, name: r.organization.name }));

    return { success: true, orgs };
  } catch (error) {
    console.error('getPaymentLogOrgs error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load payment log orgs',
      statusCode: 500,
    });
  }
}


async function getPaymentLogEvents(request, reply) {
  try {
    const { logId } = request.params;
    const events = await prisma.paymentEventLog.findMany({
      where: { paymentLogId: logId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, events };
  } catch (error) {
    console.error('getPaymentLogEvents error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load payment log events',
      statusCode: 500,
    });
  }
}

module.exports = {
  getBillingOverview,
  overrideSubscription,
  getUsageOverview,
  getPlatformPaymentLogs,
  getPaymentLogEvents,
  getPaymentLogOrgs,
};
