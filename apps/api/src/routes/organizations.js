const {getOrganizations, getSingleOrganization, createOrganization, updateCompanyInfo, uploadCompanyLogo} = require('../controller');

module.exports = function (fastify, opts, done) {
  //1. Get organizations
  fastify.get("/",getOrganizations);

  //2. Get single organization
  fastify.get("/:id", { preHandler: [fastify.authenticate] }, getSingleOrganization);

  //3. Create organization
  fastify.post("/", createOrganization);

  //4. Update company info
  fastify.put("/company-info", { preHandler: [fastify.authenticate] }, updateCompanyInfo);

  //5. Upload company logo
  fastify.post("/upload-logo", { preHandler: [fastify.authenticate] }, uploadCompanyLogo);

  done();
};
