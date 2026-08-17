const { Prisma } = require('@prisma/client');
const { encodeCursor, decodeCursor, fingerprint } = require('../utils/libraryCursor');

async function listItems(prisma, params) {
  const {
    workspaceId,
    view,
    pageSize = 48,
    pageToken,
    sortBy = 'date',
    sortOrder = 'desc',
    q = '',
    mediaType = 'all',
    dateRange = 'all',
    dateFrom,
    dateTo,
    tagIds = '',
    reviewStatus = 'all',
  } = params;

  const fp = fingerprint(params);
  const cursor = decodeCursor(pageToken, fp);

  let cursorCondition = Prisma.empty;
  const limit = parseInt(pageSize, 10) + 1;
  const isDesc = sortOrder === 'desc';

  // For keyset pagination
  if (cursor) {
    if (isDesc) {
      cursorCondition = Prisma.sql`AND (
        sort_date < ${new Date(cursor.sv)} 
        OR (sort_date = ${new Date(cursor.sv)} AND id < ${cursor.id})
      )`;
    } else {
      cursorCondition = Prisma.sql`AND (
        sort_date > ${new Date(cursor.sv)} 
        OR (sort_date = ${new Date(cursor.sv)} AND id > ${cursor.id})
      )`;
    }
  }

  const assetConditions = [
    Prisma.sql`"deletedAt" IS NULL`
  ];
  const folderConditions = [];
  const projectConditions = [];

  if (view !== 'shared') {
    const isSpecificContainer = view === 'project' || view === 'folder';

    if (!isSpecificContainer) {
      assetConditions.push(Prisma.sql`"workspace_id" = ${workspaceId}`);
    }

    assetConditions.push(Prisma.sql`(
      "visibility" = 'public' 
      OR ("visibility" = 'private' AND "uploadedByUserId" = ${params.userId}::uuid)
      OR id IN (SELECT "asset_id" FROM "asset_users" WHERE "user_id" = ${params.userId}::uuid)
      OR id IN (SELECT "asset_id" FROM "asset_groups" WHERE "group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${params.userId}::uuid))
      OR id IN (
        SELECT "asset_id" FROM "project_sources" WHERE "project_id" IN (
          SELECT id FROM "projects" WHERE ("status" IS NULL OR "status" != 'inactive') AND "visibility" = 'public' ${!isSpecificContainer ? Prisma.sql`AND "workspace_id" = ${workspaceId}` : Prisma.empty}
          UNION
          SELECT pu."project_id" FROM "project_users" pu
            INNER JOIN "projects" p ON p.id = pu."project_id"
            WHERE pu."user_id" = ${params.userId}::uuid ${!isSpecificContainer ? Prisma.sql`AND p."workspace_id" = ${workspaceId}` : Prisma.empty}
          UNION
          SELECT pg."project_id" FROM "project_groups" pg
            INNER JOIN "projects" p ON p.id = pg."project_id"
            WHERE pg."group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${params.userId}::uuid)
            ${!isSpecificContainer ? Prisma.sql`AND p."workspace_id" = ${workspaceId}` : Prisma.empty}
        )
      )
    )`);

    if (!isSpecificContainer) {
      folderConditions.push(Prisma.sql`"workspace_id" = ${workspaceId}`);
      projectConditions.push(Prisma.sql`"workspace_id" = ${workspaceId}`);
    }
    projectConditions.push(Prisma.sql`("status" IS NULL OR "status" != 'inactive')`);
    projectConditions.push(Prisma.sql`(
      "visibility" = 'public' 
      OR ("visibility" = 'private' AND (
        id IN (SELECT "project_id" FROM "project_users" WHERE "user_id" = ${params.userId}::uuid)
        OR id IN (SELECT "project_id" FROM "project_groups" WHERE "group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${params.userId}::uuid))
      ))
    )`);
  }

  if (view === 'favorites' && params.userId) {
    assetConditions.push(Prisma.sql`id IN (SELECT "assetId" FROM "favorites" WHERE "userId" = ${params.userId}::uuid)`);
    folderConditions.push(Prisma.sql`id IN (SELECT "folderId" FROM "favorites" WHERE "userId" = ${params.userId}::uuid)`);
    projectConditions.push(Prisma.sql`id IN (SELECT "projectId" FROM "favorites" WHERE "userId" = ${params.userId}::uuid)`);
  } else if (view === 'duplicates') {
    assetConditions.push(Prisma.sql`"status" = 'duplicate'`);
    folderConditions.push(Prisma.sql`false`);
    projectConditions.push(Prisma.sql`false`);
  } else if (view === 'shared') {
    assetConditions.push(Prisma.sql`(
      ("uploadedByUserId" != ${params.userId}::uuid AND (
        id IN (SELECT "asset_id" FROM "asset_users" WHERE "user_id" = ${params.userId}::uuid)
        OR id IN (SELECT "asset_id" FROM "asset_groups" WHERE "group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${params.userId}::uuid))
      ))
      OR
      ("uploadedByUserId" = ${params.userId}::uuid AND (
        EXISTS (SELECT 1 FROM "asset_users" WHERE "asset_id" = "assets".id AND "user_id" != ${params.userId}::uuid)
        OR EXISTS (SELECT 1 FROM "asset_groups" WHERE "asset_id" = "assets".id)
        OR EXISTS (SELECT 1 FROM "share_links" WHERE "assetId" = "assets".id)
      ))
    )`);
    folderConditions.push(Prisma.sql`false`);
    projectConditions.push(Prisma.sql`("status" IS NULL OR "status" != 'inactive')`);
    projectConditions.push(Prisma.sql`(
      ("created_by_id" IS NULL OR "created_by_id" != ${params.userId}::uuid)
      AND (
        id IN (SELECT "project_id" FROM "project_users" WHERE "user_id" = ${params.userId}::uuid)
        OR id IN (SELECT "project_id" FROM "project_groups" WHERE "group_id" IN (SELECT "groupId" FROM "user_group_members" WHERE "userId" = ${params.userId}::uuid))
      )
    )`);
  } else if (view === 'folder' && params.folderId) {
    assetConditions.push(Prisma.sql`"ownerType" = 'FOLDER' AND "ownerId" = ${params.folderId}::uuid`);
    folderConditions.push(Prisma.sql`"parent_folder_id" = ${params.folderId}`);
    projectConditions.push(Prisma.sql`"owner_type" = 'FOLDER' AND "folder_id" = ${params.folderId}`);
  } else if (view === 'project' && params.projectId) {
    assetConditions.push(Prisma.sql`id IN (SELECT "asset_id" FROM "project_sources" WHERE "project_id" = ${params.projectId} AND "sourceable_type" = 'ASSET')`);
    folderConditions.push(Prisma.sql`id IN (SELECT "folder_id" FROM "project_sources" WHERE "project_id" = ${params.projectId} AND "sourceable_type" = 'FOLDER')`);
    projectConditions.push(Prisma.sql`false`);
  } else if (view === 'projects') {
    assetConditions.push(Prisma.sql`false`);
    folderConditions.push(Prisma.sql`false`);
  }

  if (q) {
    const likeQuery = `%${q}%`;
    assetConditions.push(Prisma.sql`"title" ILIKE ${likeQuery}`);
    folderConditions.push(Prisma.sql`"name" ILIKE ${likeQuery}`);
    projectConditions.push(Prisma.sql`"name" ILIKE ${likeQuery}`);
  }

  if (mediaType && mediaType !== 'all') {
    if (mediaType === 'folder') {
      assetConditions.push(Prisma.sql`false`);
      projectConditions.push(Prisma.sql`false`);
    } else if (mediaType === 'project') {
      assetConditions.push(Prisma.sql`false`);
      folderConditions.push(Prisma.sql`false`);
    } else {
      folderConditions.push(Prisma.sql`false`);
      projectConditions.push(Prisma.sql`false`);
      assetConditions.push(Prisma.sql`"type" = ${mediaType}`);
    }
  }

  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    let startDate = null;
    if (dateRange === 'today') {
      now.setHours(0, 0, 0, 0);
      startDate = now;
    } else if (dateRange === '7days') {
      now.setDate(now.getDate() - 7);
      startDate = now;
    } else if (dateRange === '30days') {
      now.setDate(now.getDate() - 30);
      startDate = now;
    } else if (dateRange === 'custom' && dateFrom) {
      startDate = new Date(dateFrom);
    }

    if (startDate) {
      assetConditions.push(Prisma.sql`"createdAt" >= ${startDate}`);
      folderConditions.push(Prisma.sql`"created_at" >= ${startDate}`);
      projectConditions.push(Prisma.sql`"created_at" >= ${startDate}`);
    }

    if (dateRange === 'custom' && dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      assetConditions.push(Prisma.sql`"createdAt" <= ${endDate}`);
      folderConditions.push(Prisma.sql`"created_at" <= ${endDate}`);
      projectConditions.push(Prisma.sql`"created_at" <= ${endDate}`);
    }
  }

  if (tagIds) {
    const ids = tagIds.split(',').filter(Boolean);
    if (ids.length > 0) {
      assetConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "asset_tags" 
        JOIN "tags" ON "tags"."id" = "asset_tags"."tagId" 
        WHERE "asset_tags"."assetId" = "assets".id 
        AND ("tags"."name" IN (${Prisma.join(ids)}) OR "tags"."id"::text IN (${Prisma.join(ids)}))
      )`);
      folderConditions.push(Prisma.sql`false`);
      projectConditions.push(Prisma.sql`false`);
    }
  }

  if (reviewStatus && reviewStatus !== 'all') {
    if (reviewStatus === 'New') {
      // Default status: missing metadata, empty value, or explicitly "New"
      assetConditions.push(Prisma.sql`(
        NOT EXISTS (SELECT 1 FROM "asset_metadata" am WHERE am."assetId" = "assets".id)
        OR EXISTS (
          SELECT 1 FROM "asset_metadata" am
          WHERE am."assetId" = "assets".id
          AND (
            am."customProperties"->>'reviewStatus' IS NULL
            OR am."customProperties"->>'reviewStatus' = ''
            OR am."customProperties"->>'reviewStatus' = 'New'
          )
        )
      )`);
    } else {
      assetConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "asset_metadata" am
        WHERE am."assetId" = "assets".id
        AND am."customProperties"->>'reviewStatus' = ${reviewStatus}
      )`);
    }
    folderConditions.push(Prisma.sql`false`);
    projectConditions.push(Prisma.sql`false`);
  }

  const assetWhere = assetConditions.length ? Prisma.sql`WHERE ${Prisma.join(assetConditions, ' AND ')}` : Prisma.empty;
  const folderWhere = folderConditions.length ? Prisma.sql`WHERE ${Prisma.join(folderConditions, ' AND ')}` : Prisma.empty;
  const projectWhere = projectConditions.length ? Prisma.sql`WHERE ${Prisma.join(projectConditions, ' AND ')}` : Prisma.empty;

  const query = Prisma.sql`
    SELECT 
      id::text as id, 
      title as name, 
      'asset'::text as type, 
      "createdAt" as sort_date,
      COALESCE((SELECT MAX("sizeBytes") FROM "asset_files" WHERE "assetId" = "assets".id), 0)::bigint as sort_size
    FROM "assets"
    ${assetWhere}

    UNION ALL

    SELECT 
      id::text as id, 
      name, 
      'folder'::text as type, 
      "created_at" as sort_date,
      0::bigint as sort_size
    FROM "folders"
    ${folderWhere}

    UNION ALL

    SELECT 
      id::text as id, 
      name, 
      'project'::text as type, 
      "created_at" as sort_date,
      0::bigint as sort_size
    FROM "projects"
    ${projectWhere}
  `;

  const orderBy = sortBy === 'date' ? 'sort_date' : sortBy === 'name' ? 'name' : 'sort_size';
  const direction = isDesc ? 'DESC' : 'ASC';
  const orderBySql = Prisma.raw(`ORDER BY ${orderBy} ${direction}, id ${direction}`);

  const finalQuery = Prisma.sql`
    WITH UnifiedList AS (
      ${query}
    )
    SELECT * FROM UnifiedList
    WHERE 1=1 ${cursorCondition}
    ${orderBySql}
    LIMIT ${limit}
  `;

  const rawResults = await prisma.$queryRaw(finalQuery);

  let hasNextPage = rawResults.length === limit;
  if (hasNextPage) {
    rawResults.pop();
  }

  // Fetch full details
  const assetIds = rawResults.filter(r => r.type === 'asset').map(r => r.id);
  const folderIds = rawResults.filter(r => r.type === 'folder').map(r => r.id);
  const projectIds = rawResults.filter(r => r.type === 'project').map(r => r.id);

  const now = new Date();
  const [assets, folders, projects] = await Promise.all([
    assetIds.length > 0 ? prisma.asset.findMany({
      where: { id: { in: assetIds } },
      include: {
        files: true,
        metadata: true,
        sources: true,
        assetTags: { include: { tag: true } },
        ...(view === 'shared' ? {
          shareLinks: {
            where: { revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, name: true, visibility: true, mode: true, expiresAt: true, createdAt: true, downloadCount: true }
          }
        } : {})
      }
    }) : [],
    folderIds.length > 0 ? prisma.folder.findMany({
      where: { id: { in: folderIds } },
      include: {
        sources: true,
        _count: { select: { children: true, projects: true } }
      }
    }) : [],
    projectIds.length > 0 ? prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: { _count: { select: { sources: true } } }
    }) : []
  ]);

  const folderAssetCounts = folderIds.length > 0 ? await prisma.asset.groupBy({
    by: ['ownerId'],
    where: { ownerType: 'FOLDER', ownerId: { in: folderIds }, deletedAt: null },
    _count: { _all: true }
  }) : [];

  // Map to frontend DTO shape
  const mappedItems = rawResults.map(raw => {
    if (raw.type === 'asset') {
      const a = assets.find(x => x.id === raw.id);
      if (!a) return null;

      const originalFile = a.files?.find(f => f.fileClass === 'original');
      const proxyFile = a.files?.find(f => f.fileClass === 'proxy');
      const fileUrl = `/api/media/${encodeURIComponent(a.id)}/stream`;

      const determineAssetTypeInline = (asset, original) => {
        if (asset.type) return asset.type;
        const mime = original?.mimeType || "";
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("audio/")) return "audio";
        return "document";
      };

      const dbTags = (a.assetTags && a.assetTags.length > 0)
        ? a.assetTags.map(at => at.tag?.name).filter(Boolean)
        : [];

      let customMetadata = {};
      if (a.metadata?.customProperties) {
        customMetadata =
          typeof a.metadata.customProperties === 'string'
            ? JSON.parse(a.metadata.customProperties)
            : a.metadata.customProperties;
      }

      return {
        id: a.id,
        title: a.title,
        type: determineAssetTypeInline(a, originalFile),
        path: proxyFile ? proxyFile.filePath : originalFile?.filePath || '',
        sizeBytes: Number(originalFile?.sizeBytes || 0),
        createdAt: a.createdAt.toISOString(),
        url: fileUrl,
        thumbnail: `/api/media/${encodeURIComponent(a.id)}/thumbnail`,
        uploadedBy: a.uploadedByUserId || null,
        tags: dbTags,
        status: a.status,
        workspaceId: a.workspaceId,
        customMetadata,
        reviewStatus: customMetadata.reviewStatus || 'New',
        parentFolderId: a.ownerType === 'FOLDER' ? a.ownerId : null,
        linkedProjectIds: a.sources ? a.sources.map(ps => ps.projectId) : [],
        isSharedByMe: a.uploadedByUserId === params.userId,
        ...(a.shareLinks ? (() => {
          const nowTs = Date.now();
          const active = a.shareLinks.filter(sl => new Date(sl.expiresAt).getTime() > nowTs);
          const expired = a.shareLinks.filter(sl => new Date(sl.expiresAt).getTime() <= nowTs);
          return {
            shareCount: a.shareLinks.length,
            activeShareCount: active.length,
            expiredShareCount: expired.length,
            isShareActive: active.length > 0,
            sharedAt: a.shareLinks[0]?.createdAt?.toISOString() || null,
            shareLinks: a.shareLinks,
          };
        })() : {})
      };
    } else if (raw.type === 'folder') {
      const f = folders.find(x => x.id === raw.id);
      if (!f) return null;

      const ac = folderAssetCounts.find(a => a.ownerId === f.id)?._count?._all || 0;
      const itemCount = (f._count?.children || 0) + (f._count?.projects || 0) + ac;

      return {
        id: f.id,
        title: f.name,
        type: 'folder',
        isFolder: true,
        createdAt: f.createdAt.toISOString(),
        color: f.color,
        workspaceId: f.workspaceId,
        parentFolderId: f.parentFolderId || null,
        linkedProjectIds: f.sources ? f.sources.map(ps => ps.projectId) : [],
        itemCount
      };
    } else if (raw.type === 'project') {
      const p = projects.find(x => x.id === raw.id);
      if (!p) return null;
      return {
        id: p.id,
        title: p.name,
        type: 'folder',
        isProject: true,
        createdAt: p.createdAt.toISOString(),
        workspaceId: p.workspaceId,
        isSharedByMe: Boolean(p.createdById && p.createdById === params.userId),
        itemCount: p._count?.sources || 0
      };
    }
  }).filter(Boolean);

  let nextPageToken = null;
  if (hasNextPage) {
    const lastItem = rawResults[rawResults.length - 1];
    nextPageToken = encodeCursor({
      sortValue: lastItem.sort_date.toISOString(),
      id: lastItem.id,
      sortBy,
      sortOrder,
      fp
    });
  }

  return {
    items: mappedItems,
    nextPageToken,
    pageSize: parseInt(pageSize)
  };
}

module.exports = { listItems };
