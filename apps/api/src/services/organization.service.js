// apps/api/src/services/organization.service.js

/**
 * Ensures that default organization settings exist for a given organization.
 * If they do not exist, it creates them with predefined default values.
 * 
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client instance
 * @param {string} orgId - The UUID of the organization
 * @returns {Promise<Object>} The organization settings
 */
async function ensureDefaultOrganizationSettings(prisma, orgId) {
  if (!orgId) throw new Error("orgId is required");

  let settings = await prisma.organizationSettings.findUnique({
    where: { orgId }
  });

  if (!settings) {
    settings = await prisma.organizationSettings.create({
      data: {
        orgId,
        requirePasswordDefault: true,
        allowCommentsDefault: false,
        allowDownloadOriginalDefault: true,
        allowDownloadProxyDefault: true,
        showCompanyWatermarkDefault: true,
        defaultExpiryDays: 30
      }
    });
  }

  return settings;
}

module.exports = {
  ensureDefaultOrganizationSettings
};
