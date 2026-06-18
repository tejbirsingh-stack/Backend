const {getOrganizations, getSingleOrganization, createOrganization} = require('../controller');

module.exports = function (fastify, opts, done) {
  //1. Get organizations
  fastify.get("/",getOrganizations);

  //2. Get single organization
  fastify.get("/:id",getSingleOrganization);

  //3. Create organization
  fastify.post("/", createOrganization);

  done();
};
