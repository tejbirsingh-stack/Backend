import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_IDS = {
  SYSTEM_ADMIN: '350c047a-60a1-4a84-8bdb-79748e9a906e',
  ADMIN: '88a6b2a1-b2f6-40d5-8b04-4abf7eb45401', // User updated Admin ID
  EDITOR: '93cdf95e-dd2a-45b7-965d-cab2d1423784',
  SUPER_ADMIN: '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15',
  VIEWER: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
  COLLABORATOR: 'ffeec394-0e40-49e1-aed3-61962118d73e',
};

const PERMISSIONS = [
  { slug: 'manage_subscription_billing', name: 'Subscription & Billing Mgmt' },
  { slug: 'view_audit_analytics', name: 'System-wide Audit & Analytics' },
  { slug: 'manage_users_permissions', name: 'Manage Users & Permissions' },
  { slug: 'manage_root_folders', name: 'Create/Delete Root Folders' },
  { slug: 'upload_delete_media', name: 'Upload & Delete Media' },
  { slug: 'edit_metadata_tags', name: 'Edit Metadata & Auto-tags' },
  { slug: 'download_original_assets', name: 'Download Original Assets' },
  { slug: 'timeline_annotations', name: 'Timeline Annotations & Comments' },
  { slug: 'view_search_media', name: 'View, Search & Preview Media' },
];

const ROLE_PERMISSIONS_MAP = {
  [ROLE_IDS.SUPER_ADMIN]: PERMISSIONS.map(p => p.slug),
  [ROLE_IDS.ADMIN]: PERMISSIONS.map(p => p.slug).filter(slug => slug !== 'manage_subscription_billing'),
  [ROLE_IDS.EDITOR]: ['upload_delete_media', 'edit_metadata_tags', 'download_original_assets', 'timeline_annotations', 'view_search_media'],
  [ROLE_IDS.COLLABORATOR]: ['download_original_assets', 'timeline_annotations', 'view_search_media'],
  [ROLE_IDS.VIEWER]: ['view_search_media'],
};

async function main() {
  console.log('Seeding permissions...');
  const permissionIds = {};
  for (const perm of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { slug: perm.slug },
      update: { name: perm.name },
      create: { slug: perm.slug, name: perm.name },
    });
    permissionIds[perm.slug] = p.id;
  }

  console.log('Assigning permissions to roles...');
  for (const [roleId, slugs] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    // Check if role exists first
    const roleExists = await prisma.role.findUnique({ where: { id: roleId } });
    if (roleExists) {
      // Clear existing role permissions
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      
      // Assign new ones
      for (const slug of slugs) {
        await prisma.rolePermission.create({
          data: {
            roleId,
            permissionId: permissionIds[slug],
          },
        });
      }
    } else {
      console.log(`Role ${roleId} not found in DB, skipping assignment.`);
    }
  }

  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
