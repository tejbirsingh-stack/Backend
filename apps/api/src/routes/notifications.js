const { getNotifications, markAsRead } = require('../controller');

module.exports = function (fastify, opts, done) {
  fastify.get('/', { preValidation: [fastify.authenticate] }, getNotifications);
  fastify.put('/:notificationId/read', { preValidation: [fastify.authenticate] }, markAsRead);
  
  done();
};
