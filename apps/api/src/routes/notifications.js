const { getNotifications, markAsRead, deleteNotification } = require('../controller');

module.exports = function (fastify, opts, done) {
  fastify.get('/', { preValidation: [fastify.authenticate] }, getNotifications);
  fastify.put('/:notificationId/read', { preValidation: [fastify.authenticate] }, markAsRead);
  fastify.delete('/:notificationId', { preValidation: [fastify.authenticate] }, deleteNotification);
  
  done();
};

