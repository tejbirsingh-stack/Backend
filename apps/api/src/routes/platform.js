const { requirePlatformAdmin } = require('../middleware/platform-auth.middleware');
const {
  platformLogin,
  platformMe,
  platformLogout,
} = require('../controller/platform-auth.controller');
const { getDashboardSummary } = require('../controller/platform-dashboard.controller');
const {
  listOrganizations,
  getOrganization,
  patchOrganization,
  updateWorkspace,
} = require('../controller/platform-organizations.controller');
const {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listPublicPlans,
} = require('../controller/platform-plans.controller');
const {
  getBillingOverview,
  overrideSubscription,
  getUsageOverview,
} = require('../controller/platform-billing.controller');
const {
  listModerationFlags,
  createModerationFlag,
  updateModerationFlag,
  searchMediaMatrix,
  forceDeleteAsset,
} = require('../controller/platform-moderation.controller');
const {
  listPlatformActivity,
  getReportingSummary,
} = require('../controller/platform-activity.controller');
const {
  getLandingPage,
  updateLandingPage,
  getPublishedLanding,
} = require('../controller/platform-landing.controller');

/**
 * Platform Admin API — NOAH operator console.
 * Prefixed at /api/platform by index.ts registration.
 */
module.exports = function platformRoutes(fastify, _opts, done) {
  // Auth (public)
  fastify.post('/auth/login', platformLogin);

  // Public catalog + published landing (customer-facing)
  fastify.get('/catalog/plans', listPublicPlans);
  fastify.get('/public/landing', getPublishedLanding);

  // Protected platform routes
  fastify.get('/auth/me', { preHandler: requirePlatformAdmin }, platformMe);
  fastify.post('/auth/logout', { preHandler: requirePlatformAdmin }, platformLogout);

  fastify.get('/dashboard/summary', { preHandler: requirePlatformAdmin }, getDashboardSummary);

  fastify.get('/organizations', { preHandler: requirePlatformAdmin }, listOrganizations);
  fastify.get('/organizations/:orgId', { preHandler: requirePlatformAdmin }, getOrganization);
  fastify.patch('/organizations/:orgId', { preHandler: requirePlatformAdmin }, patchOrganization);
  fastify.patch(
    '/organizations/:orgId/workspaces/:workspaceId',
    { preHandler: requirePlatformAdmin },
    updateWorkspace,
  );

  fastify.get('/plans', { preHandler: requirePlatformAdmin }, listPlans);
  fastify.post('/plans', { preHandler: requirePlatformAdmin }, createPlan);
  fastify.patch('/plans/:planId', { preHandler: requirePlatformAdmin }, updatePlan);
  fastify.delete('/plans/:planId', { preHandler: requirePlatformAdmin }, deletePlan);

  fastify.get('/billing/overview', { preHandler: requirePlatformAdmin }, getBillingOverview);
  fastify.patch(
    '/billing/organizations/:orgId',
    { preHandler: requirePlatformAdmin },
    overrideSubscription,
  );
  fastify.get('/usage/overview', { preHandler: requirePlatformAdmin }, getUsageOverview);

  fastify.get('/moderation/flags', { preHandler: requirePlatformAdmin }, listModerationFlags);
  fastify.post('/moderation/flags', { preHandler: requirePlatformAdmin }, createModerationFlag);
  fastify.patch(
    '/moderation/flags/:flagId',
    { preHandler: requirePlatformAdmin },
    updateModerationFlag,
  );
  fastify.get('/media/search', { preHandler: requirePlatformAdmin }, searchMediaMatrix);
  fastify.post(
    '/media/:assetId/force-delete',
    { preHandler: requirePlatformAdmin },
    forceDeleteAsset,
  );

  fastify.get('/activity', { preHandler: requirePlatformAdmin }, listPlatformActivity);
  fastify.get('/reporting/summary', { preHandler: requirePlatformAdmin }, getReportingSummary);

  fastify.get('/landing/:slug', { preHandler: requirePlatformAdmin }, getLandingPage);
  fastify.get('/landing', { preHandler: requirePlatformAdmin }, getLandingPage);
  fastify.put('/landing/:slug', { preHandler: requirePlatformAdmin }, updateLandingPage);

  done();
};
