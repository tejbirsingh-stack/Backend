import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_IDS = {
  SYSTEM_ADMIN: '350c047a-60a1-4a84-8bdb-79748e9a906e',
  ADMIN: '88a6b2a1-b2f6-40d5-8b04-4abf7eb45401',
  EDITOR: '93cdf95e-dd2a-45b7-965d-cab2d1423784',
  SUPER_ADMIN: '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15',
  VIEWER: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
  COLLABORATOR: 'ffeec394-0e40-49e1-aed3-61962118d73e',
};

const PERMISSIONS = [
  { slug: 'view_search_media', name: 'View, Search & Preview Media' },
  { slug: 'download_stream_media', name: 'Stream & Download Media' },
  { slug: 'upload_media', name: 'Upload Media' },
  { slug: 'delete_media', name: 'Hard Delete Media' },
  { slug: 'manage_trash', name: 'Trash & Restore' },
  { slug: 'edit_metadata_tags', name: 'Edit Metadata & Tags' },
  { slug: 'timeline_annotations', name: 'Timeline Annotations' },
  { slug: 'annotation_privacy', name: 'Annotation Privacy Controls' },
  { slug: 'create_share_links', name: 'Create Public Review Links' },
  { slug: 'manage_users_permissions', name: 'Manage Users & Permissions' },
  { slug: 'configure_sso_mfa', name: 'OAuth SSO & MFA Configuration' },
  { slug: 'view_audit_analytics', name: 'Audit & Analytics' },
  { slug: 'manage_root_folders', name: 'Create/Delete Root Folders' },
  { slug: 'manage_subscription_billing', name: 'Subscription & Billing' },
  { slug: 'provision_enterprise_org', name: 'Enterprise Account Provisioning' },
  { slug: 'manage_infrastructure', name: 'Infrastructure / AWS Setup' },
];

const ROLE_PERMISSIONS_MAP = {
  [ROLE_IDS.SUPER_ADMIN]: PERMISSIONS.map((p) => p.slug),
  [ROLE_IDS.ADMIN]: PERMISSIONS.map((p) => p.slug).filter(
    (s) =>
      !['manage_subscription_billing', 'provision_enterprise_org', 'manage_infrastructure'].includes(s)
  ),
  [ROLE_IDS.EDITOR]: [
    'view_search_media',
    'download_stream_media',
    'upload_media',
    'manage_trash',
    'edit_metadata_tags',
    'timeline_annotations',
    'annotation_privacy',
    'create_share_links',
  ],
  [ROLE_IDS.COLLABORATOR]: [
    'view_search_media',
    'download_stream_media',
    'timeline_annotations',
    'annotation_privacy',
  ],
  [ROLE_IDS.VIEWER]: [
    'view_search_media',
    'download_stream_media',
  ],
};

async function main() {
  console.log('Retiring legacy permission slugs...');
  await prisma.permission.deleteMany({
    where: { slug: 'upload_delete_media' },
  });

  console.log('Seeding 16 canonical permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { slug: perm.slug },
      update: { name: perm.name },
      create: { slug: perm.slug, name: perm.name },
    });
  }

  console.log('Assigning permissions to 5 roles...');
  for (const [roleId, permSlugs] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    const roleExists = await prisma.role.findUnique({ where: { id: roleId } });
    if (!roleExists) continue;

    await prisma.rolePermission.deleteMany({ where: { roleId } });

    for (const slug of permSlugs) {
      const perm = await prisma.permission.findUnique({ where: { slug } });
      if (perm) {
        await prisma.rolePermission.create({
          data: { roleId, permissionId: perm.id },
        });
      }
    }
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
