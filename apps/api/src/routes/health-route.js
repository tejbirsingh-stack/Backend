const { checkHealth } = require ('../controller');

// Health check route for Docker and Kubernetes
module.exports = function (fastify, opts, done){
  // Mount the Health Controller
  fastify.get("/health", checkHealth);
  done();
};
