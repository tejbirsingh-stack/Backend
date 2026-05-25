module.exports = function (fastify, opts, done) {
  // Get organizations
  fastify.get("/", async (request, reply) => {
    reply.send({ message: "Organizations endpoints not yet implemented" });
  });

  // Get single organization
  fastify.get("/:id", async (request, reply) => {
    reply.send({
      message: `Organization ${request.params.id} endpoint not yet implemented`,
    });
  });

  // Create organization
  fastify.post("/", async (request, reply) => {
    reply.send({
      message: "Organization creation endpoint not yet implemented",
    });
  });

  done();
};
