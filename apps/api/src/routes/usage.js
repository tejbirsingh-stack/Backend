const { getUsageSummaryController, reconcileUsageController } = require('../controller');
const { authenticate } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  fastify.get('/summary', { preHandler: [authenticate] }, getUsageSummaryController);
  fastify.post('/reconcile', { preHandler: [authenticate] }, reconcileUsageController);

  done();
};
