module.exports = function (fastify, opts, done) {
  fastify.post("/:id/soft-delete", async (request, reply) => {
    const { id } = request.params;
    // In a real application, you would update the database here.
    // For now, we'll just simulate a successful response.
    console.log(`Soft deleting asset with ID: ${id}`);
    reply.send({ success: true, message: `Asset ${id} soft-deleted.` });
  });

  done();
};
