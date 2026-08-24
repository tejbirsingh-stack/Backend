const B2StorageService = require('../b2-storage.cjs');

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

const DEFAULT_NOAH_LOGO_URL = 'https://qa.noahcloud.ai/noah-logo.png';

/**
 * Resolves organization branding details (Logo URL, Account Name, Accent Color).
 * Reads the logo_url column directly from public.organisation_branding_settings in PostgreSQL DB.
 * Uses orgId first, then falls back to organization name to match uploaded B2 logo.
 */
async function resolveOrgBranding(prisma, orgId, options = {}) {
  if (!orgId || !prisma) {
    return { logoUrl: DEFAULT_NOAH_LOGO_URL, accountName: null, accentColor: null };
  }

  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId } }).catch(() => null);
    let branding = await prisma.organisationBrandingSetting.findUnique({
      where: { orgId }
    }).catch(() => null);

    // Fallback: If this specific orgId has no logoUrl or logoKey, look up branding by organization name in DB!
    if ((!branding || (!branding.logoUrl && !branding.logoKey)) && org?.name) {
      const nameBranding = await prisma.organisationBrandingSetting.findFirst({
        where: {
          accountName: { equals: org.name, mode: 'insensitive' },
          OR: [
            { logoUrl: { not: null } },
            { logoKey: { not: null } }
          ]
        }
      }).catch(() => null);
      if (nameBranding) {
        branding = nameBranding;
      }
    }

    const accountName = branding?.accountName || org?.name || null;
    const logoKey = branding?.logoKey || org?.metadata?.logoKey || null;

    let logoUrl = null;

    // 1. Read logo_url column directly from database table (organisation_branding_settings.logo_url)
    const dbUrl = branding?.logoUrl || org?.metadata?.logoUrl || null;
    if (dbUrl && typeof dbUrl === 'string' && !dbUrl.includes('localhost') && dbUrl.startsWith('http')) {
      logoUrl = dbUrl;
    }

    // 2. If logo_url is missing or localhost, generate 7-day presigned URL from logoKey via B2 storage
    if ((!logoUrl || logoUrl.includes('localhost')) && logoKey && b2Storage.isEnabled()) {
      try {
        const expiresIn = options.forEmail || options.longLived ? 604800 : 86400;
        logoUrl = await b2Storage.getPresignedUrl(logoKey, expiresIn);
      } catch (e) {
        console.warn(`[Branding Service] Error generating presigned URL for key ${logoKey}:`, e.message);
      }
    }

    // 3. Fallback to default Noah logo if no URL found
    if (!logoUrl || typeof logoUrl !== 'string' || !logoUrl.startsWith('http')) {
      logoUrl = DEFAULT_NOAH_LOGO_URL;
    }

    return {
      logoUrl,
      logoKey,
      accountName,
      accentColor: branding?.accentColor || null,
    };
  } catch (err) {
    console.warn(`[Branding Service] Could not resolve branding for org ${orgId}:`, err.message);
    return { logoUrl: DEFAULT_NOAH_LOGO_URL, logoKey: null, accountName: null, accentColor: null };
  }
}

module.exports = { resolveOrgBranding };
