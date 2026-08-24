const prisma = require('../../utils/prisma');

const AI_INSIGHTS_FEATURE_ID = 'ai_insights';
const AI_INSIGHTS_FEATURE_NAME = 'AI Insights';

function isAiEnabledFromEnv() {
  return String(process.env.AI_ENABLED || '').toLowerCase() === 'true';
}

function isPlanEntitlementOn() {
  return String(process.env.AI_PLAN_ENTITLEMENT || '').toLowerCase() === 'true';
}

function orgHasAiInsightsFeature(org) {
  const selections = org?.currentPlan?.featureSelections || [];
  return selections.some(
    (s) => s.feature?.id === AI_INSIGHTS_FEATURE_ID || s.feature?.name === AI_INSIGHTS_FEATURE_NAME,
  );
}

/** Sync check for session payloads. Plan lookup only runs when AI_PLAN_ENTITLEMENT=true. */
function computeAiEnabledSync(org) {
  if (!isAiEnabledFromEnv()) {
    return false;
  }
  if (!isPlanEntitlementOn()) {
    return true;
  }
  return orgHasAiInsightsFeature(org);
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
      currentPlan: {
        include: { featureSelections: { include: { feature: true } } },
      },
    },
  });
  return orgHasAiInsightsFeature(org);
}

module.exports = {
  AI_INSIGHTS_FEATURE_ID,
  isAiEnabledFromEnv,
  isPlanEntitlementOn,
  computeAiEnabledSync,
  isAiEnabledForOrg,
};
