module.exports = function (fastify, opts, done) {
  // Get collections
  fastify.get("/", async (request, reply) => {
    reply.send({ message: "Collections endpoints not yet implemented" });
  });

  // Get single collection
  fastify.get("/:id", async (request, reply) => {
    reply.send({
      message: `Collection ${request.params.id} endpoint not yet implemented`,
    });
  });

  // Create collection
  fastify.post("/", async (request, reply) => {
    reply.send({ message: "Collection creation endpoint not yet implemented" });
  });

  done();
};
