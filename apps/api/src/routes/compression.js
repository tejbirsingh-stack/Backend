module.exports = function (fastify, opts, done) {
  // Compression request
  fastify.post("/request", async (request, reply) => {
    reply.send({ message: "Compression request endpoint not yet implemented" });
  });

  // Compression status
  fastify.get("/status/:id", async (request, reply) => {
    reply.send({
      message: `Compression status endpoint for ${request.params.id} not yet implemented`,
    });
  });

  done();
};
