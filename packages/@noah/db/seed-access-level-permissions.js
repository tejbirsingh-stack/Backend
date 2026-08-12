const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ACCESS_LEVEL_IDS = {
  FULL_ACCESS: '10f1fe4a-f28f-4d76-a7c2-6175dfe04c9b',
  CAN_EDIT: 'd321a6c5-c28a-4dc4-900e-4dc57fe276bf',
  CAN_VIEW: 'eef95f55-9cf3-490a-bf4c-0af6292c191d'
};

const ACCESS_LEVEL_PERMISSIONS_MAP = {
  [ACCESS_LEVEL_IDS.FULL_ACCESS]: [
    'manage_users_permissions',
    'manage_root_folders',
    'upload_media',
    'edit_metadata_tags',
    'timeline_annotations',
    'view_search_media',
    'download_stream_media'
  ],
  [ACCESS_LEVEL_IDS.CAN_EDIT]: [
    'upload_media',
    'edit_metadata_tags',
    'timeline_annotations',
    'view_search_media',
    'download_stream_media'
  ],
  [ACCESS_LEVEL_IDS.CAN_VIEW]: [
    'view_search_media',
    'download_stream_media'
  ]
};

async function seedAccessLevelPermissions() {
  try {
    console.log("Seeding AccessLevel permissions...");

    for (const [accessLevelId, permSlugs] of Object.entries(ACCESS_LEVEL_PERMISSIONS_MAP)) {
      const levelExists = await prisma.accessLevel.findUnique({ where: { id: accessLevelId } });
      if (!levelExists) {
        console.warn(`AccessLevel ${accessLevelId} not found, skipping.`);
        continue;
      }

      await prisma.accessLevelPermission.deleteMany({ where: { accessLevelId } });

      for (const slug of permSlugs) {
        const perm = await prisma.permission.findUnique({ where: { slug } });
        if (perm) {
          await prisma.accessLevelPermission.create({
            data: { accessLevelId, permissionId: perm.id },
          });
        } else {
          console.warn(`Permission ${slug} not found`);
        }
      }
      console.log(`✅ Assigned ${permSlugs.length} permissions to AccessLevel ${accessLevelId}`);
    }

    console.log("🎉 AccessLevel permissions seeded successfully");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seedAccessLevelPermissions();
