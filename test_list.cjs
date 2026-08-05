const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const finalQuery = `WITH UnifiedList AS ( SELECT id::text as id, title as name, 'asset'::text as type, "createdAt" as sort_date, COALESCE((SELECT MAX("sizeBytes") FROM "asset_files" WHERE "assetId" = "assets".id), 0)::bigint as sort_size FROM "assets" WHERE "deletedAt" IS NULL AND "workspace_id" = 'c08487b8-7925-4a82-8561-70287d5c4f14' UNION ALL SELECT id::text as id, name, 'folder'::text as type, "created_at" as sort_date, 0::bigint as sort_size FROM "folders" WHERE "workspace_id" = 'c08487b8-7925-4a82-8561-70287d5c4f14' UNION ALL SELECT id::text as id, name, 'project'::text as type, "created_at" as sort_date, 0::bigint as sort_size FROM "projects" WHERE "workspace_id" = 'c08487b8-7925-4a82-8561-70287d5c4f14' ) SELECT * FROM UnifiedList WHERE 1=1 ORDER BY sort_date DESC, id DESC LIMIT 49`;
  const rawResults = await prisma.$queryRawUnsafe(finalQuery);
  console.log("Raw Results length:", rawResults.length);
  
  const folderIds = rawResults.filter(r => r.type === 'folder').map(r => r.id);
  console.log("Folder IDs:", folderIds);
  
  const folders = await prisma.folder.findMany({ where: { id: { in: folderIds } } });
  console.log("Folders found:", folders.length);
  
  const mapped = rawResults.map(raw => {
      if (raw.type === 'folder') {
        const f = folders.find(x => x.id === raw.id);
        if (!f) {
          console.log("Missing folder for raw id:", raw.id);
          return null;
        }
        return { id: f.id };
      }
      return null;
  }).filter(Boolean);
  
  console.log("Mapped:", mapped);
}
run().catch(console.error).finally(() => prisma.$disconnect());
