const { cleanupAuditLogs, processTrashRetention } = require('../controller');


module.exports = function (fastify, opts, done) {
  // Allow both GET and POST so IT teams can easily trigger it with simple cURL or scheduled webhooks
  fastify.post('/cleanup-audit-logs', cleanupAuditLogs);
  fastify.post('/process-trash-retention', processTrashRetention);

  done();
};
