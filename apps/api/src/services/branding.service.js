const B2StorageService = require('../b2-storage.cjs');

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

/**
 * Resolves organization branding details (Logo URL, Account Name, Accent Color)
 * Returns custom branding if set, or null so components fall back to Noah defaults.
 */
async function resolveOrgBranding(prisma, orgId) {
  if (!orgId || !prisma) {
    return { logoUrl: null, accountName: null, accentColor: null };
  }

  try {
    const branding = await prisma.organisationBrandingSetting.findUnique({
      where: { orgId }
    });

    if (!branding) {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      return {
        logoUrl: org?.metadata?.logoUrl || null,
        accountName: org?.name || null,
        accentColor: null
      };
    }

    let logoUrl = branding.logoUrl || null;
    if (branding.logoKey && b2Storage.isEnabled()) {
      try {
        logoUrl = await b2Storage.getPresignedUrl(branding.logoKey);
      } catch (err) {
        logoUrl = branding.logoUrl || null;
      }
    }

    return {
      logoUrl,
      accountName: branding.accountName || null,
      accentColor: branding.accentColor || null,
    };
  } catch (err) {
    console.warn(`[Branding Service] Could not resolve branding for org ${orgId}:`, err.message);
    return { logoUrl: null, accountName: null, accentColor: null };
  }
}

module.exports = { resolveOrgBranding };
