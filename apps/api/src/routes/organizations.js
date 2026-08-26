const { authenticate } = require('../middleware/auth-middleware');
const {
  getOrganizations,
  getSingleOrganization,
  createOrganization,
  updateCompanyInfo,
  uploadCompanyLogo,
  getShareSettings,
  updateShareSettings,
  getBrandingSettings,
  updateBrandingSettings,
  uploadBrandingHeader,
} = require('../controller');

module.exports = function (fastify, opts, done) {
  //1. Get organizations (authenticated — platform listing uses /api/platform/organizations)
  fastify.get("/", { preHandler: [authenticate] }, getOrganizations);

  //2. Get single organization
  fastify.get("/:id", { preHandler: [authenticate] }, getSingleOrganization);

  //3. Create organization
  fastify.post("/", { preHandler: [authenticate] }, createOrganization);

  //4. Update company info
  fastify.put("/company-info", { preHandler: [authenticate] }, updateCompanyInfo);

  //5. Upload company logo
  fastify.post("/upload-logo", { preHandler: [authenticate] }, uploadCompanyLogo);

  //6. Get share settings
  fastify.get("/share-settings", { preHandler: [fastify.authenticate] }, getShareSettings);

  //7. Update share settings
  fastify.patch("/share-settings", { preHandler: [fastify.authenticate] }, updateShareSettings);

  //8. Get branding settings
  fastify.get("/branding", { preHandler: [authenticate] }, getBrandingSettings);

  //9. Update branding settings
  fastify.put("/branding", { preHandler: [authenticate] }, updateBrandingSettings);

  //10. Upload branding header image
  fastify.post("/branding/upload-header", { preHandler: [authenticate] }, uploadBrandingHeader);

  done();
};
