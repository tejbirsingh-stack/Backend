module.exports = function (fastify, opts, done) {
  // Get users
  fastify.get("/", async (request, reply) => {
    reply.send({ message: "Users endpoints not yet implemented" });
  });

  // Get single user
  fastify.get("/:id", async (request, reply) => {
    reply.send({
      message: `User ${request.params.id} endpoint not yet implemented`,
    });
  });

  // Create user
  fastify.post("/", async (request, reply) => {
    reply.send({ message: "User creation endpoint not yet implemented" });
  });

  done();
};
