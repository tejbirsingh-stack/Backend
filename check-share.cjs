const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const token = '0f4227a745f1473377875ecc2b3a4a43';
  
  const shareLink = await prisma.shareLink.findFirst({
    where: { token },
    include: { organization: true }
  });
  
  if (shareLink) {
    console.log('FOUND in share_links');
    console.log('orgId:', shareLink.orgId);
    console.log('permissions:', JSON.stringify(shareLink.permissions, null, 2));
    
    const branding = await prisma.organisationBrandingSetting.findUnique({ where: { orgId: shareLink.orgId } });
    console.log('branding logoKey:', branding?.logoKey || 'NONE');
    
    const org = await prisma.organization.findUnique({ where: { id: shareLink.orgId } });
    console.log('org metadata logoKey:', org?.metadata?.logoKey || 'NONE');
    return;
  }
  
  const recipient = await prisma.shareLinkRecipient.findFirst({
    where: { token },
    include: { shareLink: { include: { organization: true } } }
  });
  
  if (recipient) {
    const sl = recipient.shareLink;
    console.log('FOUND in share_link_recipients');
    console.log('orgId:', sl.orgId);
    console.log('permissions:', JSON.stringify(sl.permissions, null, 2));
    
    const branding = await prisma.organisationBrandingSetting.findUnique({ where: { orgId: sl.orgId } });
    console.log('branding logoKey:', branding?.logoKey || 'NONE');
    
    const org = await prisma.organization.findUnique({ where: { id: sl.orgId } });
    console.log('org metadata logoKey:', org?.metadata?.logoKey || 'NONE');
    return;
  }
  
  console.log('TOKEN NOT FOUND');
}

main().finally(() => prisma.$disconnect());
