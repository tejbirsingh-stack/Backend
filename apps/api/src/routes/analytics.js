const { getAnalytics, getUsageAnalytics } = require('../controller');
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  const canViewAnalytics = { preValidation: [authenticate, requirePermission('view_audit_analytics')] };

  fastify.get("/", canViewAnalytics, getAnalytics);  
  fastify.get("/usage", canViewAnalytics, getUsageAnalytics);

  done();
};
