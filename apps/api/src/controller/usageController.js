const usageMeterService = require('../services/usage-meter.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getOrgIdFromRequest(req) {
  if (req.user?.orgId) return req.user.orgId;
  if (req.user?.organizationId) return req.user.organizationId;
  // Fallback: try to find user's org from DB or first org in system
  if (req.user?.id) {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { orgId: true },
    });
    if (u?.orgId) return u.orgId;
  }

  const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
  return firstOrg?.id || null;
}

async function getUsageSummaryController(req, reply) {
  try {
    const orgId = await getOrgIdFromRequest(req);
    if (!orgId) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const summary = await usageMeterService.getUsageSummary(orgId);
    return reply.code(200).send(summary);
  } catch (err) {
    req.log.error(err);
    const statusCode = err.statusCode || 500;
    return reply.code(statusCode).send({
      error: err.code || 'USAGE_SUMMARY_ERROR',
      message: err.message || 'Failed to fetch usage summary',
    });
  }
}

async function reconcileUsageController(req, reply) {
  try {
    const orgId = await getOrgIdFromRequest(req);
    if (!orgId) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const result = await usageMeterService.reconcileOrgStorage(orgId);
    return reply.code(200).send({
      message: 'Storage usage reconciled successfully',
      data: result,
    });
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({
      error: 'RECONCILE_ERROR',
      message: err.message || 'Failed to reconcile storage usage',
    });
  }
}

module.exports = {
  getUsageSummaryController,
  reconcileUsageController,
};
