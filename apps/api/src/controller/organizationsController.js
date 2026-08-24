// Organizations Controller
const path = require('path');
const B2StorageService = require("../b2-storage.cjs");
const { ensureDefaultOrganizationSettings } = require("../services/organization.service");

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});//1. Get organizations
module.exports.getOrganizations = async (request, reply) => {
    try{
      const orgs = await request.server.prisma.organization.findMany({
        select : {
          id: true,
          name: true,
        }
      });
      reply.send(orgs);
    }catch (err){
      request.log.error(err);
      reply.status(500).send({ error: "Failed to fetch organizations" });
    }
};


//2. Get single organization
module.exports.getSingleOrganization = async (request, reply) => {
  try {
    const orgId = request.params.id === 'current' ? request.user?.orgId : request.params.id;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }
    const org = await request.server.prisma.organization.findUnique({
      where: { id: orgId }
    });
    if (!org) {
      return reply.code(404).send({ error: 'Organization not found' });
    }
    if (org.metadata && org.metadata.logoKey) {
      if (b2Storage.isEnabled()) {
        org.metadata.logoUrl = await b2Storage.getPresignedUrl(org.metadata.logoKey);
      }
    }
    return reply.send(org);
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch organization", message: error.message });
  }
};

//3. Create organization
module.exports.createOrganization = async (request, reply) => {
    reply.send({message: "Organization creation endpoint not yet implemented"});
};

//4. Update Company Info
module.exports.updateCompanyInfo = async (request, reply) => {
  try {
    const { id, name, website, industry, logoUrl, logoKey } = request.body;
    
    // Fallback to the user's organization if ID not provided
    const targetOrgId = id || request.user?.orgId;
    
    if (!targetOrgId) {
      return reply.code(400).send({ error: "Organization ID is required" });
    }

    const org = await request.server.prisma.organization.findUnique({
      where: { id: targetOrgId }
    });

    if (!org) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    // Merge existing metadata with new updates
    const existingMetadata = (typeof org.metadata === 'string' ? JSON.parse(org.metadata) : org.metadata) || {};
    const updatedMetadata = { ...existingMetadata };
    
    if (website !== undefined) updatedMetadata.website = website;
    if (industry !== undefined) updatedMetadata.industry = industry;
    if (logoUrl !== undefined) updatedMetadata.logoUrl = logoUrl;
    if (logoKey !== undefined) updatedMetadata.logoKey = logoKey;

    const updatedOrg = await request.server.prisma.organization.update({
      where: { id: targetOrgId },
      data: {
        ...(name !== undefined ? { name } : {}),
        metadata: updatedMetadata
      }
    });

    return reply.send({
      success: true,
      organization: updatedOrg
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to update company info", message: error.message });
  }
};

//5. Upload Company Logo
module.exports.uploadCompanyLogo = async (request, reply) => {
  try {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    // Determine target organization
    // Pass orgId in multipart fields or default to user's org
    const targetOrgId = data.fields?.orgId?.value || request.user?.orgId;
    if (!targetOrgId) {
      return reply.code(400).send({ error: "Organization ID is required" });
    }

    const org = await request.server.prisma.organization.findUnique({
      where: { id: targetOrgId }
    });

    if (!org) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    // Sanitize organization name for B2 key
    const sanitizedOrgName = org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const ext = path.extname(data.filename) || '.png';
    const uniqueFilename = `logo_${Date.now()}${ext}`;
    const b2Key = `noah-uploads/${sanitizedOrgName}/logo/${uniqueFilename}`;

    // Upload to B2
    const uploadedAsset = await b2Storage.uploadStream(
      data.file,
      b2Key,
      data.mimetype,
      { type: 'company_logo', orgId: targetOrgId }
    );

    // Store long-lived / public URL for branding logo
    const longLivedLogoUrl = (await b2Storage.getPresignedUrl(uploadedAsset.key, 604800)) || b2Storage.getPublicUrl(uploadedAsset.key) || uploadedAsset.url;

    // Also update logoKey & logoUrl in organisation_branding_settings
    await request.server.prisma.organisationBrandingSetting.upsert({
      where: { orgId: targetOrgId },
      update: {
        logoKey: uploadedAsset.key,
        logoUrl: longLivedLogoUrl,
      },
      create: {
        orgId: targetOrgId,
        accountName: org.name,
        accountInitials: org.name ? org.name.slice(0, 2).toUpperCase() : 'NO',
        logoKey: uploadedAsset.key,
        logoUrl: longLivedLogoUrl,
      },
    }).catch(() => {});

    return reply.send({
      success: true,
      logoUrl: longLivedLogoUrl,
      b2Key: uploadedAsset.key
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to upload company logo", message: error.message });
  }
};

//6. Get Share Settings
module.exports.getShareSettings = async (request, reply) => {
  try {
    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    const settings = await ensureDefaultOrganizationSettings(request.server.prisma, orgId);

    return reply.send(settings);
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch share settings", message: error.message });
  }
};

//7. Update Share Settings
module.exports.updateShareSettings = async (request, reply) => {
  try {
    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    const { requirePasswordDefault, allowCommentsDefault, allowDownloadOriginalDefault, allowDownloadProxyDefault, showCompanyWatermarkDefault, defaultExpiryDays } = request.body;

    const dataToUpdate = {};
    if (requirePasswordDefault !== undefined) dataToUpdate.requirePasswordDefault = requirePasswordDefault;
    if (allowCommentsDefault !== undefined) dataToUpdate.allowCommentsDefault = allowCommentsDefault;
    if (allowDownloadOriginalDefault !== undefined) dataToUpdate.allowDownloadOriginalDefault = allowDownloadOriginalDefault;
    if (allowDownloadProxyDefault !== undefined) dataToUpdate.allowDownloadProxyDefault = allowDownloadProxyDefault;
    if (showCompanyWatermarkDefault !== undefined) dataToUpdate.showCompanyWatermarkDefault = showCompanyWatermarkDefault;
    if (defaultExpiryDays !== undefined) dataToUpdate.defaultExpiryDays = defaultExpiryDays;

    const settings = await request.server.prisma.organizationSettings.upsert({
      where: { orgId },
      update: dataToUpdate,
      create: {
        orgId,
        ...dataToUpdate
      }
    });

    return reply.send({ success: true, settings });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to update share settings", message: error.message });
  }
};

// 8. Get Branding Settings
module.exports.getBrandingSettings = async (request, reply) => {
  try {
    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    const org = await request.server.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true }
    });

    let branding = await request.server.prisma.organisationBrandingSetting.findUnique({
      where: { orgId }
    });

    if (!branding) {
      const defaultName = org?.name || "User's Account";
      const initials = defaultName.slice(0, 2).toUpperCase();
      branding = await request.server.prisma.organisationBrandingSetting.create({
        data: {
          orgId,
          accountName: defaultName,
          accountInitials: initials,
          accentColor: '#5B53FF',
          reelBackgroundColor: 'None',
          reelTitleColor: 'None',
          headerImageMaxMb: 25,
        }
      });
    }

    // Refresh B2 presigned URLs with long-lived validity (7 days) if keys exist
    if (branding.logoKey && b2Storage.isEnabled()) {
      branding.logoUrl = await b2Storage.getPresignedUrl(branding.logoKey, 604800).catch(() => branding.logoUrl);
    }
    if (branding.headerImageKey && b2Storage.isEnabled()) {
      branding.headerImageUrl = await b2Storage.getPresignedUrl(branding.headerImageKey, 604800).catch(() => branding.headerImageUrl);
    }

    return reply.send({
      success: true,
      branding: {
        accountName: branding.accountName || org?.name || "User's Account",
        accountInitials: branding.accountInitials || (branding.accountName ? branding.accountName.slice(0, 2).toUpperCase() : 'NO'),
        logoUrl: branding.logoUrl || null,
        logoKey: branding.logoKey || null,
        headerImageUrl: branding.headerImageUrl || null,
        headerImageKey: branding.headerImageKey || null,
        headerImageMaxMb: branding.headerImageMaxMb || 25,
        accentColor: branding.accentColor || '#5B53FF',
        reelBackgroundColor: branding.reelBackgroundColor || 'None',
        reelTitleColor: branding.reelTitleColor || 'None',
        updatedAt: branding.updatedAt,
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch branding settings", message: error.message });
  }
};

// 9. Update Branding Settings
module.exports.updateBrandingSettings = async (request, reply) => {
  try {
    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    const { accountName, accentColor, reelBackgroundColor, reelTitleColor } = request.body || {};

    const updateData = {};
    if (typeof accountName === 'string' && accountName.trim()) {
      updateData.accountName = accountName.trim();
      updateData.accountInitials = accountName.trim().slice(0, 2).toUpperCase();
    }
    if (typeof accentColor === 'string') updateData.accentColor = accentColor.trim();
    if (typeof reelBackgroundColor === 'string') updateData.reelBackgroundColor = reelBackgroundColor.trim();
    if (typeof reelTitleColor === 'string') updateData.reelTitleColor = reelTitleColor.trim();

    const branding = await request.server.prisma.organisationBrandingSetting.upsert({
      where: { orgId },
      update: updateData,
      create: {
        orgId,
        ...updateData
      }
    });

    return reply.send({
      success: true,
      message: 'Branding settings updated successfully in database',
      branding: {
        accountName: branding.accountName,
        accountInitials: branding.accountInitials,
        logoUrl: branding.logoUrl,
        logoKey: branding.logoKey,
        headerImageUrl: branding.headerImageUrl,
        headerImageKey: branding.headerImageKey,
        headerImageMaxMb: branding.headerImageMaxMb,
        accentColor: branding.accentColor,
        reelBackgroundColor: branding.reelBackgroundColor,
        reelTitleColor: branding.reelTitleColor,
        updatedAt: branding.updatedAt,
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to update branding settings", message: error.message });
  }
};

// 10. Upload Branding Header Image (Max 25MB)
module.exports.uploadBrandingHeader = async (request, reply) => {
  try {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No header image file uploaded" });
    }

    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.code(400).send({ error: "Organization ID is required" });
    }

    const org = await request.server.prisma.organization.findUnique({
      where: { id: orgId }
    });
    if (!org) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    const sanitizedOrgName = org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const ext = path.extname(data.filename) || '.png';
    const uniqueFilename = `header_${Date.now()}${ext}`;
    const b2Key = `noah-uploads/${sanitizedOrgName}/branding/${uniqueFilename}`;

    const uploadedAsset = await b2Storage.uploadStream(
      data.file,
      b2Key,
      data.mimetype,
      { type: 'branding_header', orgId }
    );

    // Save headerKey and headerUrl to organisation_branding_settings
    const branding = await request.server.prisma.organisationBrandingSetting.upsert({
      where: { orgId },
      update: {
        headerImageKey: uploadedAsset.key,
        headerImageUrl: uploadedAsset.url,
      },
      create: {
        orgId,
        accountName: org.name,
        accountInitials: org.name ? org.name.slice(0, 2).toUpperCase() : 'NO',
        headerImageKey: uploadedAsset.key,
        headerImageUrl: uploadedAsset.url,
      }
    });

    return reply.send({
      success: true,
      headerImageUrl: uploadedAsset.url,
      b2Key: uploadedAsset.key,
      branding
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to upload branding header image", message: error.message });
  }
};
