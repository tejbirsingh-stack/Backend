// Organizations Controller
const path = require('path');
const B2StorageService = require("../b2-storage.cjs");

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

    return reply.send({
      success: true,
      logoUrl: uploadedAsset.url,
      b2Key: uploadedAsset.key
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to upload company logo", message: error.message });
  }
};
