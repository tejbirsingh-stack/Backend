module.exports = function (fastify, opts, done) {
  // Get organizations
  fastify.get("/", async (request, reply) => {
    try{
      const orgs = await fastify.prisma.organization.findMany({
        select : {
          id: true,
          name: true,
        }
      });
      reply.send(orgs);
    }catch (err){
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to fetch organizations" });
    }
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
