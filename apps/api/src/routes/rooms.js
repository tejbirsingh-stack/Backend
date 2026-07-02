const { createRoom, verifyRoom, getRoomInfo, listRooms } = require('../controller');

module.exports = function (fastify, opts, done) {
  fastify.post('/create', createRoom);
  fastify.post('/verify', verifyRoom);
  fastify.get('/list', listRooms);
  fastify.get('/:roomId', getRoomInfo);

  done();
};
