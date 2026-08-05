const { listLibraryItems } = require('../controller/libraryController');
const { authenticate } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  fastify.addHook("preHandler", authenticate);

  fastify.get('/items', listLibraryItems);
  
  done();
};
