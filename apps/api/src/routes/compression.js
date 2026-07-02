const { compress , compressStatus } = require('../controller');

module.exports = function (fastify, opts, done) {
  //1. Compression request
  fastify.post("/request",compress);

  //2. Compression status
  fastify.get("/status/:id", compressStatus);

  done();
};
