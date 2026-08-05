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
    tagIds = ''
  } = params;

  const fp = fingerprint(params);
  const cursor = decodeCursor(pageToken, fp);

  let cursorCondition = '';
  const limit = parseInt(pageSize, 10) + 1;
  const isDesc = sortOrder === 'desc';

  // For keyset pagination
  if (cursor) {
    const op = isDesc ? '<' : '>';
    cursorCondition = `AND (
      sort_date ${op} '${cursor.sv}' 
      OR (sort_date = '${cursor.sv}' AND id ${op} '${cursor.id}')
    )`;
  }

  let query = '';

  let assetWhere = `WHERE "deletedAt" IS NULL AND "workspace_id" = '${workspaceId}'`;
  let folderWhere = `WHERE "workspace_id" = '${workspaceId}'`;
  let projectWhere = `WHERE "workspace_id" = '${workspaceId}'`;

  if (view === 'favorites' && params.userId) {
    assetWhere += ` AND id IN (SELECT "assetId" FROM "favorites" WHERE "userId" = '${params.userId}')`;
    folderWhere += ` AND id IN (SELECT "folderId" FROM "favorites" WHERE "userId" = '${params.userId}')`;
    projectWhere += ` AND id IN (SELECT "projectId" FROM "favorites" WHERE "userId" = '${params.userId}')`;
  } else if (view === 'duplicates') {
    assetWhere += ` AND "status" = 'duplicate'`;
    folderWhere += ` AND false`;
    projectWhere += ` AND false`;
  } else if (view === 'shared') {
    // Currently no shared logic
    assetWhere += ` AND false`;
    folderWhere += ` AND false`;
    projectWhere += ` AND false`;
  } else if (view === 'folder' && params.folderId) {
    assetWhere += ` AND "ownerType" = 'FOLDER' AND "ownerId" = '${params.folderId}'`;
    folderWhere += ` AND "parent_folder_id" = '${params.folderId}'`;
    projectWhere += ` AND "owner_type" = 'FOLDER' AND "folder_id" = '${params.folderId}'`;
  } else if (view === 'project' && params.projectId) {
    assetWhere += ` AND id IN (SELECT "asset_id" FROM "project_sources" WHERE "project_id" = '${params.projectId}' AND "sourceable_type" = 'ASSET')`;
    folderWhere += ` AND id IN (SELECT "folder_id" FROM "project_sources" WHERE "project_id" = '${params.projectId}' AND "sourceable_type" = 'FOLDER')`;
    projectWhere += ` AND false`;
  } else if (view === 'projects') {
    assetWhere += ` AND false`;
    folderWhere += ` AND false`;
    projectWhere += ``;
  }

  if (q) {
      // Very basic SQL injection protection for ILIKE, though proper prepared statements are preferred
      const safeQ = q.replace(/'/g, "''");
      assetWhere += ` AND "title" ILIKE '%${safeQ}%'`;
      folderWhere += ` AND "name" ILIKE '%${safeQ}%'`;
      projectWhere += ` AND "name" ILIKE '%${safeQ}%'`;
    }

    if (mediaType && mediaType !== 'all') {
      if (mediaType === 'folder') {
        assetWhere += ` AND false`;
        projectWhere += ` AND false`;
      } else if (mediaType === 'project') {
        assetWhere += ` AND false`;
        folderWhere += ` AND false`;
      } else {
        folderWhere += ` AND false`;
        projectWhere += ` AND false`;
        assetWhere += ` AND "type" = '${mediaType}'`;
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
        const iso = startDate.toISOString();
        assetWhere += ` AND "createdAt" >= '${iso}'`;
        folderWhere += ` AND "created_at" >= '${iso}'`;
        projectWhere += ` AND "created_at" >= '${iso}'`;
      }

      if (dateRange === 'custom' && dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        const isoEnd = endDate.toISOString();
        assetWhere += ` AND "createdAt" <= '${isoEnd}'`;
        folderWhere += ` AND "created_at" <= '${isoEnd}'`;
        projectWhere += ` AND "created_at" <= '${isoEnd}'`;
      }
    }

    if (tagIds) {
      const ids = tagIds.split(',').filter(Boolean);
      if (ids.length > 0) {
        const tagList = ids.map(id => `'${id}'`).join(',');
        assetWhere += ` AND EXISTS (SELECT 1 FROM "asset_tags" WHERE "asset_tags"."assetId" = "assets".id AND "asset_tags"."tagId" IN (${tagList}))`;
        folderWhere += ` AND false`;
        projectWhere += ` AND false`;
      }
    }

    query = `
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

  const finalQuery = `
    WITH UnifiedList AS (
      ${query}
    )
    SELECT * FROM UnifiedList
    WHERE 1=1 ${cursorCondition}
    ORDER BY ${orderBy} ${isDesc ? 'DESC' : 'ASC'}, id ${isDesc ? 'DESC' : 'ASC'}
    LIMIT ${limit}
  `;

  const rawResults = await prisma.$queryRawUnsafe(finalQuery);

  let hasNextPage = rawResults.length === limit;
  if (hasNextPage) {
    rawResults.pop();
  }

  // Fetch full details
  const assetIds = rawResults.filter(r => r.type === 'asset').map(r => r.id);
  const folderIds = rawResults.filter(r => r.type === 'folder').map(r => r.id);
  const projectIds = rawResults.filter(r => r.type === 'project').map(r => r.id);

  const [assets, folders, projects] = await Promise.all([
    assetIds.length > 0 ? prisma.asset.findMany({ where: { id: { in: assetIds } }, include: { files: true, metadata: true, assetTags: { include: { tag: true } } } }) : [],
    folderIds.length > 0 ? prisma.folder.findMany({ where: { id: { in: folderIds } } }) : [],
    projectIds.length > 0 ? prisma.project.findMany({ where: { id: { in: projectIds } } }) : []
  ]);

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
        workspaceId: a.workspaceId
      };
    } else if (raw.type === 'folder') {
      const f = folders.find(x => x.id === raw.id);
      if (!f) return null;
      return {
        id: f.id,
        title: f.name,
        type: 'folder',
        isFolder: true,
        createdAt: f.createdAt.toISOString(),
        color: f.color,
        workspaceId: f.workspaceId
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
        workspaceId: p.workspaceId
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
