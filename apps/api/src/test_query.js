const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { encodeCursor, decodeCursor, fingerprint } = require('./utils/libraryCursor');

async function test() {
  const workspaceId = 'ae5cbf5b-2936-415d-855f-06ca282c0132'; // PRIVATE1
  const userId = 'e4387081-5f85-4ff5-8bd0-71a6233442b3';
  const folderId = '3ca8ce04-34d7-41bd-978c-b9f25d78ae77'; // test2

  const assetConditions = [ Prisma.sql`"deletedAt" IS NULL` ];
  const isSpecificContainer = true;

  assetConditions.push(Prisma.sql`(
      "visibility" = 'public' 
      OR ("visibility" = 'private' AND "uploadedByUserId" = ${userId}::uuid)
      OR id IN (SELECT "asset_id" FROM "asset_users" WHERE "user_id" = ${userId}::uuid)
      OR id IN (SELECT "asset_id" FROM "asset_groups" WHERE "group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${userId}::uuid))
      OR id IN (
        SELECT "asset_id" FROM "project_sources" WHERE "project_id" IN (
          SELECT id FROM "projects" WHERE ("status" IS NULL OR "status" != 'inactive') AND "visibility" = 'public' ${!isSpecificContainer ? Prisma.sql`AND "workspace_id" = ${workspaceId}` : Prisma.empty}
          UNION
          SELECT pu."project_id" FROM "project_users" pu
            INNER JOIN "projects" p ON p.id = pu."project_id"
            WHERE pu."user_id" = ${userId}::uuid ${!isSpecificContainer ? Prisma.sql`AND p."workspace_id" = ${workspaceId}` : Prisma.empty}
          UNION
          SELECT pg."project_id" FROM "project_groups" pg
            INNER JOIN "projects" p ON p.id = pg."project_id"
            WHERE pg."group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${userId}::uuid)
            ${!isSpecificContainer ? Prisma.sql`AND p."workspace_id" = ${workspaceId}` : Prisma.empty}
        )
      )
    )`);

  assetConditions.push(Prisma.sql`"ownerType" = 'FOLDER' AND "ownerId" = ${folderId}::uuid`);

  const whereSql = Prisma.sql`WHERE ${Prisma.join(assetConditions, ' AND ')}`;
  const query = Prisma.sql`SELECT id, title FROM "assets" ${whereSql}`;
  console.log("Query:", query.text);
  console.log("Values:", query.values);
  const result = await prisma.$queryRaw(query);
  console.log("Result:", result);
}
test().catch(console.error).finally(() => prisma.$disconnect());
