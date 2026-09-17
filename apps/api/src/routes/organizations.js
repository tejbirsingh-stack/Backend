const { authenticate, requireSuperAdminOrAdmin } = require('../middleware/auth-middleware');
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

  //4. Update company info (Super Admin / Admin only)
  fastify.put("/company-info", { preHandler: [authenticate, requireSuperAdminOrAdmin] }, updateCompanyInfo);

  //5. Upload company logo (Super Admin / Admin only)
  fastify.post("/upload-logo", { preHandler: [authenticate, requireSuperAdminOrAdmin] }, uploadCompanyLogo);

  //6. Get share settings
  fastify.get("/share-settings", { preHandler: [authenticate] }, getShareSettings);

  //7. Update share settings (Super Admin / Admin only)
  fastify.patch("/share-settings", { preHandler: [authenticate, requireSuperAdminOrAdmin] }, updateShareSettings);

  //8. Get branding settings
  fastify.get("/branding", { preHandler: [authenticate] }, getBrandingSettings);

  //9. Update branding settings (Super Admin / Admin only)
  fastify.put("/branding", { preHandler: [authenticate, requireSuperAdminOrAdmin] }, updateBrandingSettings);

  //10. Upload branding header image (Super Admin / Admin only)
  fastify.post("/branding/upload-header", { preHandler: [authenticate, requireSuperAdminOrAdmin] }, uploadBrandingHeader);

  done();
};
