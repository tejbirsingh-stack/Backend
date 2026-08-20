const {
  getAiStatus,
  retryAiAnalyze,
  getTranscript,
  searchTranscript,
} = require('../controller/aiController');
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  const canRead = { preHandler: [authenticate, requirePermission('view_search_media')] };
  const canRetry = { preHandler: [authenticate, requirePermission('upload_media')] };

  fastify.get('/search', canRead, searchTranscript);
  fastify.get('/assets/:id/status', canRead, getAiStatus);
  fastify.post('/assets/:id/retry', canRetry, retryAiAnalyze);
  fastify.get('/assets/:id/transcript', canRead, getTranscript);

  done();
};
