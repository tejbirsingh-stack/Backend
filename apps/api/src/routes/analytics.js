module.exports = function (fastify, opts, done) {
  // Get analytics
  fastify.get("/", async (request, reply) => {
    reply.send({ message: "Analytics endpoints not yet implemented" });
  });

  // Get usage analytics
  fastify.get("/usage", async (request, reply) => {
    reply.send({ message: "Usage analytics endpoint not yet implemented" });
  });

  done();
};
