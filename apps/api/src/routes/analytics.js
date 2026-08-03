const { getAnalytics , getUsageAnalytics} = require ('../controller');

module.exports = function (fastify, opts, done) {
  //1. Get analytics
  fastify.get("/", getAnalytics);  
  
  //2. Get usage analytics
  fastify.get("/usage", getUsageAnalytics);

  done();
};
