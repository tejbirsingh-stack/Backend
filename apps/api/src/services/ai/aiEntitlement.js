const prisma = require('../../utils/prisma');

function isAiEnabledFromEnv() {
  return String(process.env.AI_ENABLED || '').toLowerCase() === 'true';
}

function isPlanEntitlementOn() {
  return String(process.env.AI_PLAN_ENTITLEMENT || '').toLowerCase() === 'true';
}

function orgHasAiPlan(org) {
  return org?.currentPlan?.hasAI === true;
}

/** Sync check for session payloads. Plan lookup only runs when AI_PLAN_ENTITLEMENT=true. */
function computeAiEnabledSync(org) {
  if (!isAiEnabledFromEnv()) {
    return false;
  }
  if (!isPlanEntitlementOn()) {
    return true;
  }
  return orgHasAiPlan(org);
}

async function isAiEnabledForOrg(orgId, prismaClient = prisma) {
  if (!isAiEnabledFromEnv()) {
    return false;
  }
  if (!isPlanEntitlementOn()) {
    return true;
  }
  if (!orgId) {
    return false;
  }
  const org = await prismaClient.organization.findUnique({
    where: { id: orgId },
    include: {
      currentPlan: true,
    },
  });
  return orgHasAiPlan(org);
}

module.exports = {
  isAiEnabledFromEnv,
  isPlanEntitlementOn,
  computeAiEnabledSync,
  isAiEnabledForOrg,
};
