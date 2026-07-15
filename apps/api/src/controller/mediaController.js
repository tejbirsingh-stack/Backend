// Media Controller code

const fs = require("fs");
const path = require("path");

const { Queue } = require("bullmq");
const Redis = require("ioredis");

const { imageHash } = require('image-hash');
const { promisify } = require('util');
const imageHashAsync = promisify(imageHash);

// Initialize Redis connection for the Queue
const queueRedisConnection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
});

// Initialize the BullMQ queue
const compressionQueue = new Queue("compression-jobs", { 
  connection: queueRedisConnection 
});

// Initialize "Heavy" Queue for massive 5GB+ files
const heavyCompressionQueue = new Queue("compression-jobs-heavy", { 
  connection: queueRedisConnection,
});

// Dedicated Redis Client for resumable upload sessions *****
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
});
// *****

const B2StorageService = require("../b2-storage.cjs");

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

function sanitizeB2ErrorMessage(message) {
  if (!message) return "Unknown B2 error";
  let sanitized = message.replace(/The key '[^']+' is not valid/gi, "The key is not valid");
  sanitized = sanitized.replace(/\b[a-zA-Z0-9]{20,35}\b/g, "[MASKED]");
  return sanitized;
}

// 1. Move any utility functions needed by the routes here
function normalizeAssetType(mimeType = "") {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function inferMimeType(filename = "") {
  const ext = filename.toLowerCase();
  if (ext.endsWith(".mp4") || ext.endsWith(".mov") || ext.endsWith(".avi") || ext.endsWith(".webm")) return "video/mp4";
  if (ext.endsWith(".png")) return "image/png";
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg")) return "image/jpeg";
  if (ext.endsWith(".gif")) return "image/gif";
  if (ext.endsWith(".mp3") || ext.endsWith(".wav") || ext.endsWith(".m4a")) return "audio/mpeg";
  if (ext.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function toFrontendAssetShape(asset) {
  const mimeType = asset.mimeType || inferMimeType(asset.name || "");
  const normalizedType = normalizeAssetType(mimeType);
  const uploadDate = asset.uploadDate || asset.createdAt || new Date().toISOString();
  const streamUrl =
    asset.url || (asset.id ? `/api/media/${encodeURIComponent(asset.id)}/stream` : null);
  const thumbnail =
    normalizedType === "image"
      ? streamUrl
      : asset.thumbnail || null;

  return {
    id: asset.id,
    name: asset.name,
    type: normalizedType,
    size: asset.size,
    uploadDate,
    url: streamUrl,
    thumbnail,
    tags: asset.tags || [],
    metadata: asset.metadata || {},
    transcodingStatus: asset.transcodingStatus || "completed",
    transcodingProgress: asset.customMetadata?.transcodingProgress || null,
  };
}

function getUploadsDir() {
  return path.join(__dirname, "../../uploads");
}

function getAllFiles(dirPath, arrayOfFiles = []){
  const files = fs.readdirSync(dirPath);                                        
  files.forEach(function(file){
    if(fs.statSync(dirPath + "/" + file).isDirectory()){
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

function resolveMediaFilename(id) {
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) return null;

  const files = getAllFiles(uploadsDir);
  const matched = files.find((filepath) => {
    const filename = path.basename(filepath);
    if (filename === id) return true;
    const originalName = filename.replace(/^\d+-/, "");
    return originalName === id;
  });
  return matched ? matched : null;
}

async function resolveMediaFilePath(request, id) {
  if (id && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    try {
      const assetFile = await request.server.prisma.assetFile.findFirst({
        where: { assetId: id }
      });
      if (assetFile && assetFile.fileName) {
        return resolveMediaFilename(assetFile.fileName);
      }
    } catch (err) {
      console.error("Error looking up asset in resolveMediaFilePath:", err.message);
    }
  }
  return resolveMediaFilename(id);
}

async function serveMediaFile(request, reply, filePath, options = {}) {
  const { download = false, displayName } = options;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = inferMimeType(path.basename(filePath));
  const name = displayName || path.basename(filePath);

  reply.header("Accept-Ranges", "bytes");
  reply.header(
    "Content-Disposition",
    download ? `attachment; filename="${name}"` : "inline"
  );
  reply.type(mimeType);

  const range = request.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    reply.code(206);
    reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    reply.header("Content-Length", chunkSize);
    return reply.send(fs.createReadStream(filePath, { start, end }));
  }

  reply.header("Content-Length", fileSize);
  return reply.send(fs.createReadStream(filePath));
}

async function handleMediaRedirectOrServe(request, reply, filename, download = false) {
  let b2Key = null;

  if (filename && filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // If it's a UUID, look up the Asset and get its primary file (proxy if exists, else original)
    const asset = await request.server.prisma.asset.findUnique({
      where: { id: filename },
      include: { files: true }
    });
    if (asset && asset.files.length > 0) {
      const proxy = asset.files.find(f => f.fileClass === 'proxy');
      const original = asset.files.find(f => f.fileClass === 'original');
      b2Key = proxy ? proxy.filePath : original?.filePath;
    }
  } else {
    // Otherwise, try to find the exact file path
    const file = await request.server.prisma.assetFile.findFirst({
      where: {
        OR: [
          { filePath: filename },
          { fileName: filename },
          { filePath: { endsWith: '/' + filename } }
        ]
      }
    });
    if (file) {
      b2Key = file.filePath;
    } else if (filename.match(/_thumb\d+\.jpg$/)) {
      // Direct request for a B2 thumbnail generated by Coconut
      b2Key = filename;
    }
  }

  if (b2Key && b2Storage.isEnabled()) {
    const freshUrl = await b2Storage.getPresignedUrl(b2Key);
    if (freshUrl) {
      console.log(`Redirecting request for ${filename} to fresh B2 URL`);
      return reply.code(307).redirect(freshUrl);
    }
  }

  const filePath = await resolveMediaFilePath(request, filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return reply.code(404).send({ success: false, error: "File not found" });
  }

  const displayName = filename.replace(/^\d+-/, "");
  return serveMediaFile(request, reply, filePath, {
    download,
    displayName,
  });
}


//2. Get media assets - return real uploaded files
module.exports.getMediaAssets = async (request, reply) => {
  console.log("getMediaAssets called");

  try {
    const {
      query,
      type,
      sortOrder,
      limit = 20,
      offset = 0,
      orgId,
    } = request.query;

   

    // Build where condition for New Architecture
    const where = {
      orgId: orgId,
      deletedAt: null,
    };

    if (query) {
      where.title = {
        contains: query,
        mode: "insensitive",
      };
    }

    if (type && type !== "All") {
      if (type === "Video") {
        where.type = "video";
      } else if (type === "Images") {
        where.type = "image";
      } else if (type === "Audio") {
        where.type = "audio";
      } else if (type === "Document") {
        where.type = "document";
      }
    }


    // Fetch data based on orgId (New Architecture)
    const dbAssets = await request.server.prisma.asset.findMany({
      where,
      orderBy: {
        createdAt: sortOrder === "asc" ? "asc" : "desc",
      },
      take: Number(limit),
      skip: Number(offset),
      include: {
        files: true,
        metadata: true,
        transcodeJobs: {
          where: { provider: 'coconut' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
    });

    const transformedAssets = dbAssets.map((asset) => {
      const originalFile = asset.files.find(f => f.fileClass === 'original');
      const proxyFile = asset.files.find(f => f.fileClass === 'proxy');
      const transcodeJob = asset.transcodeJobs[0];

      const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;

      return {
        id: asset.id,
        name: asset.title,
        path: proxyFile ? proxyFile.filePath : originalFile?.filePath || '',
        type: normalizeAssetType(originalFile?.mimeType || ''),
        size: Number(originalFile?.sizeBytes || 0),
        uploadDate: asset.createdAt.toISOString(),
        url: fileUrl,
        thumbnail: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
        metadata: {
          duration: asset.metadata?.technicalSpecs?.durationSeconds,
          b2Key: proxyFile ? proxyFile.filePath : originalFile?.filePath,
          storageLocation: 'b2'
        },
        status: asset.status,
        customMetadata: {
          ...(asset.metadata?.customProperties ? (typeof asset.metadata.customProperties === 'string' ? JSON.parse(asset.metadata.customProperties) : asset.metadata.customProperties) : {}),
          originalFilePath: originalFile?.filePath,
          transcodingProgress: transcodeJob?.status === 'processing' 
            ? (transcodeJob.providerMetadata?.progress ? `${transcodeJob.providerMetadata.progress}` : 'processing')
            : null,
        },
        transcodingStatus: transcodeJob?.status || null,
      };
    });


    return reply.send({
      success: true,
      orgId,
      total: transformedAssets.length,
      assets: transformedAssets,
    });


  } catch (error) {
    console.error("Error reading media assets:", error);

    return reply.code(500).send({
      success: false,
      error: "Failed to retrieve media assets",
      message: error.message,
    });
  }
};

//3. Search media assets
module.exports.searchMediaAssets = async (request, reply) => {
    try {
      const { q: query = "" } = request.query;
      const userId = request.user.id;

      if (!query || !String(query).trim()) {
        return reply.code(400).send({
          success: false,
          error: "Search query is required",
          assets: [],
        });
      }

      // Query database for assets matching the search string, scoped to the logged-in user
      const dbAssets = await request.server.prisma.asset.findMany({
        where: {
          uploadedByUserId: userId,
          deletedAt: null,
          title: {
            contains: String(query),
            mode: 'insensitive'
          }
        },
        include: { files: true, metadata: true, transcodeJobs: true },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const transformedAssets = dbAssets.map(asset => {
        const originalFile = asset.files.find(f => f.fileClass === 'original');
        const proxyFile = asset.files.find(f => f.fileClass === 'proxy');
        const transcodeJob = asset.transcodeJobs.find(j => j.provider === 'coconut');
        
        const fileSize = Number(originalFile?.sizeBytes || 0);
        const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;
        const normalizedType = asset.type;

        return {
          id: asset.id,
          name: asset.title,
          type: normalizedType,
          size: fileSize,
          uploadDate: asset.createdAt.toISOString(),
          url: fileUrl,
          thumbnail: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
          tags: asset.aiTags || [],
          metadata: asset.metadata || {},
          customMetadata: {
            ...(asset.metadata?.customProperties ? (typeof asset.metadata.customProperties === 'string' ? JSON.parse(asset.metadata.customProperties) : asset.metadata.customProperties) : {}),
            transcodingProgress: transcodeJob?.status === 'processing' 
              ? (transcodeJob.providerMetadata?.progress ? `${transcodeJob.providerMetadata.progress}` : 'processing')
              : null,
          },
          compressionStatus: transcodeJob?.status || "completed",
          transcodingStatus: transcodeJob?.status || null,
        };
      });

      return reply.send({
        success: true,
        assets: transformedAssets,
        query: String(query),
        count: transformedAssets.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message,
        assets: [],
      });
    }
};

//4. Stream file for preview/playback (video player uses this URL)
module.exports.fileStreamPreview = async (request, reply) => {
    try {
      const { filename } = request.params;
      return await handleMediaRedirectOrServe(request, reply, filename, false);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to stream file",
        message: error.message,
      });
    }
};

// 4b. Stream thumbnail image directly by asset ID
module.exports.getThumbnail = async (request, reply) => {
  try {
    const { id } = request.params;
    
    // Fast path for non-UUIDs (e.g. if an old client sends a file path)
    if (!id || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return reply.code(404).send({ error: "Invalid Asset ID" });
    }

    const asset = await request.server.prisma.asset.findUnique({
      where: { id },
      include: { files: true }
    });
    
    if (!asset) {
      return reply.code(404).send({ error: "Asset not found" });
    }
    
    let thumbKey = null;
    if (asset.type === 'image') {
      const original = asset.files.find(f => f.fileClass === 'original');
      thumbKey = original?.filePath;
    } else {
      const proxy = asset.files.find(f => f.fileClass === 'proxy');
      if (proxy) thumbKey = `${proxy.filePath}_thumb1.jpg`;
    }
    
    if (!thumbKey) {
      return reply.code(404).send({ error: "Thumbnail not found" });
    }
    
    const stream = await b2Storage.downloadFile(thumbKey);
    reply.header("Content-Type", "image/jpeg");
    return reply.send(stream);
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: "Failed to stream thumbnail",
      message: error.message,
    });
  }
};

//5. Download file (browser saves to disk)
module.exports.downloadFile = async (request, reply) => {
    try {
      const { filename } = request.params;
      const { raw } = request.query;
      
      let b2Key = null;

      if (filename && filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // Look up the Asset and get its file (proxy or original depending on raw flag)
        const asset = await request.server.prisma.asset.findUnique({
          where: { id: filename },
          include: { files: true }
        });
        if (asset && asset.files.length > 0) {
          const original = asset.files.find(f => f.fileClass === 'original');
          const proxy = asset.files.find(f => f.fileClass === 'proxy');
          
          if (raw === 'true') {
            b2Key = original ? original.filePath : null;
          } else {
            b2Key = proxy ? proxy.filePath : original?.filePath;
          }
        }
      }

      if (b2Key) {
        return await handleMediaRedirectOrServe(request, reply, b2Key, true);
      }
      
      return await handleMediaRedirectOrServe(request, reply, filename, true);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to download file",
        message: error.message,
      });
    }
};

//6. List soft-deleted files (Trash)
module.exports.softDelete = async (request, reply) => {
    try {
      const userId = request.user.id;

      // Fetch soft-deleted assets from PostgreSQL database
      const dbAssets = await request.server.prisma.asset.findMany({
        where: {
          uploadedByUserId: userId,
          deletedAt: { not: null },
        },
        include: { files: true, metadata: true, transcodeJobs: true },
        orderBy: {
          deletedAt: 'desc'
        }
      });
      
      // Transform files using the same structure as active files
      const transformed = dbAssets.map(asset => {
        const originalFile = asset.files.find(f => f.fileClass === 'original');
        const proxyFile = asset.files.find(f => f.fileClass === 'proxy');
        const transcodeJob = asset.transcodeJobs.find(j => j.provider === 'coconut');

        const fileSize = Number(originalFile?.sizeBytes || 0);
        const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;
        const normalizedType = asset.type;
        
        return {
          id: asset.id,
          name: asset.title,
          type: normalizedType,
          size: fileSize,
          uploadDate: asset.createdAt.toISOString(),
          deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : new Date().toISOString(),
          url: fileUrl,
          thumbnail: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
          tags: asset.aiTags || [],
          metadata: asset.metadata || {},
          compressionStatus: asset.transcodingStatus || "completed",
          storageLocation: asset.metadata?.storageLocation || "local",
          isTrash: true,
        };
      });

      return reply.send({
        success: true,
        assets: transformed,
      });
    } catch (error) {
      console.error("Error retrieving trash assets:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to retrieve trash assets",
        message: error.message,
      });
    }
};

//7. Restore a soft-deleted file------used for restoring soft deleted files
module.exports.restoreSoftDelete = async (request, reply) => {
    try {
      const { filename } = request.params;
      
      let restoredFromDb = false;

      // 1. If it's a database UUID, restore in PostgreSQL database
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        try {
          await request.server.prisma.asset.update({
            where: { id: filename },
            data: { 
            deletedAt: null,
            status: "active"
          }

          });
          restoredFromDb = true;
        } catch (dbErr) {
          console.warn("Could not restore asset in database:", dbErr.message);
        }
      }

      // 2. Also try restoring from B2 if B2 is enabled
      if (b2Storage.isEnabled()) {
        try {
          const b2Files = await b2Storage.listTrashFiles("uploads/");
          const exactMatch = b2Files.find(f => f.id === filename || f.name === filename || f.key.endsWith(filename));

          if (exactMatch) {
            await b2Storage.restoreFile(exactMatch.key);
          }
        } catch (b2Error) {
          console.warn("Could not restore file from B2:", b2Error.message);
        }
      }

      return reply.send({
        success: true,
        message: restoredFromDb ? "File restored successfully" : "File restore attempted"
      });
    } catch (error) {
      console.error("Error restoring file:", error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
}

//8. Permanently delete a file from B2
module.exports.deletePermanently = async (request, reply) => {
    try {
      const { filename } = request.params;
      
      let deletedFromLocal = false;
      let deletedFromB2 = false;

      // Try deleting local duplicates just in case
      let filePath = await resolveMediaFilePath(request, filename);
      while (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFromLocal = true;
        filePath = await resolveMediaFilePath(request, filename);
      }

      if (b2Storage.isEnabled()) {
        try {
          const b2Files = await b2Storage.listTrashFiles("uploads/");
          const activeFiles = await b2Storage.searchFiles(filename);
          
          const allB2Files = [...b2Files, ...activeFiles];
          const exactMatch = allB2Files.find(f => f.id === filename || f.key === filename || f.key.endsWith(filename));

          if (exactMatch) {
            await b2Storage.permanentlyDeleteFile(exactMatch.key);
            deletedFromB2 = true;
          } else {
            const cleanKey = filename.startsWith("uploads/") ? filename : `uploads/${filename}`;
            await b2Storage.permanentlyDeleteFile(cleanKey);
            deletedFromB2 = true;
          }
        } catch (b2Error) {
          console.warn(`Failed to permanently delete key ${filename} from B2:`, b2Error.message);
        }
      }
 
      if (!deletedFromLocal && !deletedFromB2) {
        return reply.code(404).send({
          success: false,
          error: "File not found on local disk or B2 storage",
        });
      }

      // Also delete from database if it's a UUID
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        try {
          await request.server.prisma.asset.delete({
            where: { id: filename }
          });
        } catch (dbErr) {
          console.warn("Could not delete asset from database during permanent delete:", dbErr.message);
        }
      }

      return reply.send({
        success: true,
        message: "File permanently deleted",
        deletedFrom: {
          local: deletedFromLocal,
          b2: deletedFromB2,
        }
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
}

//9. GET /api/media/:filename — file bytes for players
module.exports.getMediaFile = async (request, reply) => {
    try {
      const { filename } = request.params;
      const wantsMeta =
        request.query.meta === "true" || request.query.meta === "1";

      if (wantsMeta) {
        // Look up by UUID first
        let fetchedAsset;
        if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          fetchedAsset = await request.server.prisma.asset.findUnique({
            where: { id: filename },
            include: { files: true, metadata: true, transcodeJobs: true }
          });
        }

        if (fetchedAsset) {
          const originalFile = fetchedAsset.files.find(f => f.fileClass === 'original');
          const proxyFile = fetchedAsset.files.find(f => f.fileClass === 'proxy');
          const transcodeJob = fetchedAsset.transcodeJobs.find(j => j.provider === 'coconut');
          
          const fileSize = Number(originalFile?.sizeBytes || 0);
          const fileUrl = `/api/media/${encodeURIComponent(fetchedAsset.id)}/stream`;
          const normalizedType = fetchedAsset.type;

          return reply.send({
            success: true,
            asset: {
              id: fetchedAsset.id,
              name: fetchedAsset.title,
              type: normalizedType,
              size: fileSize,
              uploadDate: fetchedAsset.createdAt.toISOString(),
              url: fileUrl,
              thumbnail: `/api/media/${encodeURIComponent(fetchedAsset.id)}/thumbnail`,
              tags: fetchedAsset.aiTags || [],
              metadata: fetchedAsset.metadata || {},
              status: fetchedAsset.status,
              customMetadata: {
                ...(fetchedAsset.metadata?.customProperties ? (typeof fetchedAsset.metadata.customProperties === 'string' ? JSON.parse(fetchedAsset.metadata.customProperties) : fetchedAsset.metadata.customProperties) : {}),
                transcodingProgress: transcodeJob?.status === 'processing' 
                  ? (transcodeJob.providerMetadata?.progress ? `${transcodeJob.providerMetadata.progress}` : 'processing')
                  : null,
              },
              transcodingStatus: transcodeJob?.status || "completed",
              compressionStatus: transcodeJob?.status || "completed",
            }
          });
        }

        const storedName = resolveMediaFilename(filename);
        const filePath = await resolveMediaFilePath(request, filename);
        if (!filePath || !fs.existsSync(filePath)) {
          return reply.code(404).send({ success: false, error: "File not found" });
        }

        const stats = fs.statSync(filePath);
        const mimeType = inferMimeType(storedName || filename);
        const asset = toFrontendAssetShape({
          id: storedName || filename,
          name: (storedName || filename).replace(/^\d+-/, ""),
          mimeType,
          size: stats.size,
          uploadDate: stats.mtime.toISOString(),
          tags: [],
          metadata: {},
          compressionStatus: "completed",
        });

        return reply.send({ success: true, asset });
      }

      return await handleMediaRedirectOrServe(request, reply, filename, false);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to serve file",
        message: error.message,
      });
    }
};

//10. Upload media asset
module.exports.uploadMediaFile = async (request, reply) => {
    try {
      if (!b2Storage.isEnabled()) {
        return reply.code(500).send({
          success: false,
          message: "Cloud storage is not configured. Local storage is disabled.",
        });
      }

      const totalFileSize = Number(request.query.fileSize) || Number(request.headers['x-file-size']) || 0;
      const durationSeconds = request.query.durationSeconds ? Number(request.query.durationSeconds) : null;

      // Write headers for NDJSON streaming immediately to flush them to the browser
      reply.raw.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": request.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-File-Size, X-Request-Id",
      });

      const sendProgress = (loaded, total) => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(JSON.stringify({ type: "progress", loaded, total }) + "\n");
        }
      };

      // Send initial progress immediately to flush the stream connection
      sendProgress(0, totalFileSize);

      const role = (request.user && request.user.role) ? request.user.role : "member";
      const isolationTier = (role === "super_admin" || role === "admin" || role === "system_admin") ? "internal" : "external";
      
      // Generate data-based subfolder (YYYY-MM-DD)
      const today = new Date().toISOString().split("T")[0];

      const parts = request.parts();
      const uploadedFiles = [];

      for await (const part of parts) {
        if (part.file) {
          const folderName = `${Date.now()}`;
          const filename = `raw-${part.filename}`;
          const b2Key = `uploads/${isolationTier}/${today}/${folderName}/${filename}`; 
          
          console.log(`Streaming directly to B2: ${b2Key}`);
          
          let size = 0;
          part.file.on('data', (chunk) => {
            size += chunk.length;
          });
          
          let b2Result;
          try {
            b2Result = await b2Storage.uploadStream(
              part.file,
              b2Key,
              part.mimetype,
              {
                originalName: part.filename,
              },
              (progress) => {
                console.log(`[B2 Upload Progress] ${part.filename}: ${progress.loaded} / ${totalFileSize || size}`);
                sendProgress(progress.loaded, totalFileSize || progress.total || size || 0);
              }
            );
          } catch (err) {
            console.error("Direct B2 stream failed:", err);
            throw new Error(`B2 upload failed: ${sanitizeB2ErrorMessage(err.message)}`);
          }

          const b2Url = b2Result?.url || null;
          const fileUrl = b2Url ? b2Url : `/api/media/${filename}/stream`;

          const isVideo = part.mimetype.startsWith("video/");

          const typeMap = { 'video': 'video', 'audio': 'audio', 'image': 'image' };
          const assetType = Object.keys(typeMap).find(k => part.mimetype.startsWith(`${k}/`)) || 'document';

          // Write to the New Architecture
          const newAsset = await request.server.prisma.asset.create({
            data: {
              orgId: request.user.orgId,
              title: part.filename,
              type: assetType,
              status: isVideo ? "processing" : "active",
              uploadedByUserId: request.user.id,
              files: {
                create: {
                  fileClass: "original",
                  fileName: filename,
                  filePath: b2Key,
                  sizeBytes: BigInt(size),
                  mimeType: part.mimetype,
                  cdnUrl: fileUrl
                }
              },
              metadata: {
                create: {
                  technicalSpecs: durationSeconds ? { durationSeconds } : {}
                }
              }
            }
          });

          // If it's a video, queue a compression job in Redis
          if (isVideo) {
            try {
              // Create TranscodeJob in new architecture
              await request.server.prisma.transcodeJob.create({
                data: {
                  assetId: newAsset.id,
                  provider: "coconut",
                  status: "queued"
                }
              });

              // 5GB threshold for heavy queue
              const fiveGB = 5 * 1024 * 1024 * 1024;
              const queueToUse = size >= fiveGB ? heavyCompressionQueue : compressionQueue;
              
              await queueToUse.add("compress", {
                assetId: newAsset.id, // For new webhook
                key: b2Key,
                preset: "medium", // Default to balanced H.264
              });
              console.log(`[Queue] Added video compression job for asset ${newAsset.id} to ${size >= fiveGB ? 'heavy' : 'standard'} queue`);
            } catch (queueErr) {
              console.error(`[Queue] Failed to add job to compression queue:`, queueErr.message);
            }
          }

          const fileInfo = {
            id: newAsset.id,
            name: newAsset.title,
            type: newAsset.type,
            size: Number(size),
            uploadDate: newAsset.createdAt.toISOString(),
            url: `/api/media/${encodeURIComponent(newAsset.id)}/stream`,
            thumbnail: newAsset.type === "image" ? `/api/media/${encodeURIComponent(newAsset.id)}/stream` : null,
            tags: [],
            metadata: { technicalSpecs: durationSeconds ? { durationSeconds } : {} },
            // Report correct status to the frontend
            compressionStatus: isVideo ? "queued" : "completed",
            storageLocation: "b2",
          };


          uploadedFiles.push(fileInfo);
          console.log(`File streamed directly to B2 and saved to DB: ${part.filename} (${size} bytes)`);
        }
      }

      if (uploadedFiles.length === 0) {
        if (!reply.raw.writableEnded) {
          reply.raw.write(JSON.stringify({ type: "error", message: "No files uploaded" }) + "\n");
          reply.raw.end();
        }
        reply.sent = true;
        return;
      }

      if (!reply.raw.writableEnded) {
        reply.raw.write(JSON.stringify({
          type: "complete",
          asset: uploadedFiles[0],
          files: uploadedFiles,
          uploadedTo: {
            local: false,
            b2: true,
          },
        }) + "\n");
        reply.raw.end();
      }
      reply.sent = true;

    } catch (error) {
      console.error("Upload error:", error);
      if (!reply.raw.writableEnded) {
        reply.raw.write(JSON.stringify({
          type: "error",
          message: "Upload failed",
          error: error.message,
        }) + "\n");
        reply.raw.end();
      }
      reply.sent = true;
    }
}


//11. Delete media asset
module.exports.deleteMediaFile = async (request, reply) => {
    try {
      const { filename } = request.params;
      
      // If it's a database UUID, soft-delete it in the database
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        try {
          await request.server.prisma.asset.update({
            where: { id: filename },
            data: { 
              status: "softdelete",
              deletedAt: new Date() 
            }
          });
          
          return reply.send({
            success: true,
            message: "File deleted successfully",
          });
        } catch (dbErr) {
          console.warn("Could not soft delete asset in database:", dbErr.message);
          return reply.code(500).send({
            success: false,
            error: "Failed to soft delete asset in database",
          });
        }
      } else {
        return reply.code(400).send({
          success: false,
          error: "Invalid file ID for soft delete",
        });
      }
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
};



//12. Initialize a Resumable Multipart Upload Session
module.exports.initiateResumableUpload = async (request, reply) => {
  const { fileName, fileSize, mimeType, durationSeconds } = request.body || {};
  if (!fileName || !fileSize || !mimeType) {
    return reply.status(400).send({ message: "fileName, fileSize, and mimeType are required" });
  }

  try{
    const sessionId = require("uuid").v4();
    const dateStr = new Date().toISOString().split("T")[0];
    const timestamp = Date.now();
    const b2Key = `uploads/internal/${dateStr}/${timestamp}/raw-${fileName}`;

    // Initiate upload session with Backblaze B2 S3
    const { uploadId } = await b2Storage.initiateMultipartUpload(b2Key, mimeType);

    const sessionData = {
      sessionId,
      uploadId,
      key: b2Key,
      fileName,
      fileSize: Number(fileSize),
      mimeType,
      durationSeconds: durationSeconds ? Number(durationSeconds) : null,
      parts: [],
    };

    // Save session in Redis with 24 hours TTL
    await redisClient.setex(`upload:session:${sessionId}`, 86400, JSON.stringify(sessionData));
    return { sessionId, uploadId, key: b2Key };

  } catch(error) {
    console.error("Failed to initiate resumable upload:", error);
    return reply.status(500).send({ message: "Failed to initiate upload session", error: error.message });
  }
}

//13.  Upload an individual raw binary chunk
 module.exports.uploadChunk = async (request, reply) => {
  const { sessionId } = request.query;
  
  const partNumber = parseInt(request.query.partNumber, 10);

  if (!sessionId || isNaN(partNumber)) {
    return reply.status(400).send({ message: "sessionId and valid partNumber query parameters are required" });
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found or expired" });
    }
    const session = JSON.parse(sessionRaw);

    // Read raw binary body from the request stream
    const chunks = [];
    const stream = request.body || request.raw;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const chunkBuffer = Buffer.concat(chunks);

    if (chunkBuffer.length === 0) {
      return reply.status(400).send({ message: "Empty chunk payload received" });
    }

    // Upload chunk to B2
    const partResult = await b2Storage.uploadPart(session.key, session.uploadId, partNumber, chunkBuffer);

    // Add ETag to session parts
    session.parts = session.parts.filter(p => p.PartNumber !== partNumber);
    session.parts.push({ PartNumber: partNumber, ETag: partResult.ETag });
      
    // Save updated session to Redis
    await redisClient.setex(`upload:session:${sessionId}`, 86400, JSON.stringify(session));

    return { success: true, partNumber, etag: partResult.ETag };
    
  } catch (error) {
    console.error(`Failed to upload chunk ${partNumber}:`, error);
    return reply.status(500).send({ message: `Failed to upload chunk ${partNumber}`, error: error.message });
  }
}

//13b. Get Presigned URL for chunk upload (Direct to B2)
module.exports.getChunkUploadUrl = async (request, reply) => {
  const { sessionId } = request.query;
  const partNumber = parseInt(request.query.partNumber, 10);

  if (!sessionId || isNaN(partNumber)) {
    return reply.status(400).send({ message: "sessionId and valid partNumber query parameters are required" });
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found or expired" });
    }
    const session = JSON.parse(sessionRaw);

    // Get Presigned URL for this chunk directly to B2
    const presignedUrl = await b2Storage.getPresignedPartUrl(session.key, session.uploadId, partNumber);

    return { success: true, partNumber, presignedUrl };
  } catch (error) {
    console.error(`Failed to generate upload URL for chunk ${partNumber}:`, error);
    return reply.status(500).send({ message: `Failed to generate upload URL for chunk ${partNumber}`, error: error.message });
  }
}

//14. Check which chunks have been successfully uploaded
module.exports.getUploadStatus = async (request, reply) => {
  const { sessionId } = request.params;
  try{
     const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found" });
    }
    const session = JSON.parse(sessionRaw);

    return {
      sessionId: session.sessionId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      parts: session.parts,
    };
  } catch (error) {
    console.error("❌ Failed to fetch upload status:", error);
    return reply.status(500).send({ message: "Failed to get upload status" });
  }
}

//15. Complete Multipart Upload Session and Create Database Record
module.exports.completeResumableUpload = async (request, reply) => {
  const { sessionId, parts } = request.body || {};
  if (!sessionId) {
    return reply.status(400).send({ message: "sessionId is required" })
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found or expired" });
    }

    const session = JSON.parse(sessionRaw);

    // Use parts sent from frontend if available, otherwise fallback to session parts
    const finalParts = parts && parts.length > 0 ? parts : session.parts;

    // Complete the multipart upload on B2
    console.log(`Completing multipart upload in B2 for key ${session.key}...`);

    await b2Storage.completeMultipartUpload(session.key, session.uploadId, finalParts);

    const isVideo = session.mimeType.startsWith("video/");
    const cdnUrl = `/api/media/${session.key}/stream`;

    const typeMap = { 'video': 'video', 'audio': 'audio', 'image': 'image' };
    const assetType = Object.keys(typeMap).find(k => session.mimeType.startsWith(`${k}/`)) || 'document';

    // Save the asset metadata in PostgreSQL via Prisma (New Architecture)
    const newAsset = await request.server.prisma.asset.create({
      data: {
        orgId: request.user.orgId,
        title: session.fileName,
        type: assetType,
        status: isVideo ? "processing" : "active",
        uploadedByUserId: request.user.id,
        files: {
          create: {
            fileClass: "original",
            fileName: session.fileName,
            filePath: session.key,
            sizeBytes: BigInt(session.fileSize),
            mimeType: session.mimeType,
            cdnUrl: cdnUrl
          }
        },
        metadata: {
          create: {
            technicalSpecs: session.durationSeconds ? { durationSeconds: session.durationSeconds } : {}
          }
        }
      }
    });

    // Queue compression if it's a video
    if (isVideo) {
      try {
        await request.server.prisma.transcodeJob.create({
          data: {
            assetId: newAsset.id,
            provider: "coconut",
            status: "queued"
          }
        });

        const fiveGB = BigInt(5 * 1024 * 1024 * 1024);
        const queueToUse = BigInt(session.fileSize) >= fiveGB ? heavyCompressionQueue : compressionQueue;
        await queueToUse.add("compress", {
          assetId: newAsset.id,
          key: session.key,
          preset: "medium",
        });
        console.log(`[Queue] Added video compression job for asset ${newAsset.id} to ${BigInt(session.fileSize) >= fiveGB ? 'heavy' : 'fast'} queue`);
      } catch (queueErr) {
        console.error(`[Queue] Failed to queue job for asset ${newAsset.id}:`, queueErr.message);
      }
    }

    // Clean up Redis Sessions
    await redisClient.del(`upload:session:${sessionId}`);

    const fileInfo = {
      id: newAsset.id,
      name: newAsset.title,
      type: newAsset.type,
      size: Number(session.fileSize),
      uploadDate: newAsset.createdAt.toISOString(),
      url: `/api/media/${encodeURIComponent(newAsset.id)}/stream`,
      thumbnail: null,
      tags: [],
      metadata: { technicalSpecs: session.durationSeconds ? { durationSeconds: session.durationSeconds } : {} },
      compressionStatus: isVideo ? "queued" : "completed",
      storageLocation: "b2",
    };

    return { success: true, asset: fileInfo };

  } catch (error) {
    console.error("❌ Failed to complete resumable upload:", error);
    return reply.status(500).send({ message: "Failed to complete upload session", error: error.message });
  }
}

//16. Abort Multipart Upload Session and clear chunks from B2
module.exports.abortResumableUpload = async (request, reply) => {
  const { sessionId } = request.params;

  if (!sessionId) {
    return reply.status(400).send({ message: "sessionId parameter is required" });
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      
      // Tell B2 to delete the partial uploaded chunks
      try {
        await b2Storage.abortMultipartUpload(session.key, session.uploadId);
        console.log(`[Upload Aborted] Cleaned up B2 chunks for key: ${session.key}`);
      } catch (b2Err) {
        console.error(`[Upload Aborted] Failed to clean up B2 chunks:`, b2Err.message);
        // Continue anyway to clean up Redis
      }

      // Clean up Redis Session
      await redisClient.del(`upload:session:${sessionId}`);
    }

    return { success: true, message: "Upload session aborted and cleaned up successfully" };
  } catch (error) {
    console.error("❌ Failed to abort resumable upload:", error);
    return reply.status(500).send({ message: "Failed to abort upload session", error: error.message });
  }
}

//17. Handle Coconut Webhook
module.exports.handleCoconutWebhook = async (request, reply) => {
  const event = request.body;
  const newAssetId = request.query.newAssetId;

  if (!newAssetId) {
    return reply.status(400).send("newAssetId query parameter is missing");
  }

  if (event && event.event === 'job.completed') {
    try {
      const compressedKey = request.query.compressedKey;

      await request.server.prisma.transcodeJob.updateMany({
        where: { assetId: newAssetId, provider: "coconut" },
        data: { status: 'completed' }
      });

      if (compressedKey) {
        // Retrieve actual proxy file size via HEAD request (microscopic bandwidth)
        const proxySize = await b2Storage.getFileSize(compressedKey);

        await request.server.prisma.assetFile.create({
          data: {
            assetId: newAssetId,
            fileClass: "proxy",
            fileName: compressedKey.split('/').pop() || 'compressed.mp4',
            filePath: compressedKey,
            sizeBytes: BigInt(proxySize || 0),
            mimeType: 'video/mp4',
            cdnUrl: `/api/media/${encodeURIComponent(compressedKey)}/stream`
          }
        });
      }

      // -- DUPLICATE VERIFICATION TIER 1, 2, 3 --
      
      const asset = await request.server.prisma.asset.findUnique({
        where: { id: newAssetId },
        include: { metadata: true, files: true }
      });

      let duplicateOf = [];
      const originalFile = asset.files.find(f => f.fileClass === 'original');
      const durationSeconds = asset.metadata?.technicalSpecs?.durationSeconds;
      const checksum = asset.metadata?.checksum;

      // Tier 1: Exact Checksum Match
      if (checksum && originalFile?.sizeBytes) {
        const exactMatch = await request.server.prisma.asset.findFirst({
          where : {
            id: { not: newAssetId },
            orgId: asset.orgId,
            deletedAt: null,
            metadata: { checksum: checksum },
            files: { some: { fileClass: 'original', sizeBytes: originalFile.sizeBytes } }
          }
        });
        if (exactMatch) duplicateOf.push(exactMatch.id);
      }

      // If not an exact match, run the visual check
      if (duplicateOf.length === 0) {
        // Tier 2: Metadata Filter (Find Suspects)
        const whereClause = { 
          id: { not: newAssetId },
          orgId: asset.orgId,
          deletedAt: null
        };
        
        const potentialSuspects = await request.server.prisma.asset.findMany({
          where: whereClause,
          include: { metadata: true }
        });

        const suspectIds = potentialSuspects.filter(s => {
          if (!durationSeconds) return true;
          const sDuration = s.metadata?.technicalSpecs?.durationSeconds;
          if (!sDuration) return true;
          return Number(sDuration) >= Number(durationSeconds) - 2 && Number(sDuration) <= Number(durationSeconds) + 2;
        }).map(s => s.id);

        // Tier 3: Storyboard pHash (The Visual Math)
        const baseKey = compressedKey || originalFile?.filePath;
        
        if (baseKey) {
          // 1. Download and Hash the 5 thumbnails Coconut just created
          for (let i = 1; i <= 5; i++) {
            const thumbKey = `${baseKey}_thumb${i}.jpg`;
            const thumbUrl = await b2Storage.getPresignedUrl(thumbKey, 3600); // 1-hour link
            
            if (thumbUrl) {
              try {
                let fetchResponse = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  const res = await fetch(thumbUrl);
                  if (res.ok) {
                    fetchResponse = res;
                    break;
                  }
                  if (res.status === 404 && attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  } else {
                    throw new Error(`Failed to fetch thumbnail (Status: ${res.status})`);
                  }
                }
                
                if (!fetchResponse) throw new Error("Thumbnail not found in B2 after 3 attempts");

                const arrayBuffer = await fetchResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const hashStr = await imageHashAsync({ data: buffer, name: 'thumb.jpg' }, 16, true);
                
                await request.server.prisma.videoFrameHash.create({
                  data: {
                    assetId: newAssetId,
                    frameIndex: i,
                    hashValue: hashStr
                  }
                });
              } catch(e) {
                console.error(`[Webhook] Failed to hash thumb ${i}:`, e.message);
              }
            }
          }

          // 2. PostgreSQL Hamming Distance Calculation
          if (suspectIds.length > 0) {
            const duplicateMatches = await request.server.prisma.$queryRawUnsafe(`
              SELECT vfh."assetId", COUNT(*) as match_count
              FROM video_frame_hashes vfh
              JOIN video_frame_hashes new_vfh ON new_vfh."frameIndex" = vfh."frameIndex"
              WHERE new_vfh."assetId" = $1::uuid 
                AND vfh."assetId" = ANY($2::uuid[])
                AND length(replace((('x' || vfh."hashValue")::bit(256) # ('x' || new_vfh."hashValue")::bit(256))::text, '0', '')) <= 15
              GROUP BY vfh."assetId"
              HAVING COUNT(*) >= 3
            `, newAssetId, suspectIds);
            
            duplicateMatches.forEach(match => duplicateOf.push(match.assetId));
          }
        }
      }

      // Determine final status and metadata
      const newStatus = duplicateOf.length > 0 ? 'duplicate' : 'active';
      const currentCustomProps = typeof asset.metadata?.customProperties === 'object' ? asset.metadata.customProperties : {};
      
      const updatedCustomProps = {
        ...currentCustomProps,
        duplicates: duplicateOf
      };

      await request.server.prisma.asset.update({
        where: { id: newAssetId },
        data: { status: newStatus }
      });

      if (asset.metadata) {
        await request.server.prisma.assetMetadata.update({
          where: { assetId: newAssetId },
          data: { customProperties: updatedCustomProps }
        });
      } else {
        await request.server.prisma.assetMetadata.create({
          data: {
            assetId: newAssetId,
            customProperties: updatedCustomProps
          }
        });
      }

      console.log(`[Webhook] Asset ${newAssetId} marked ${newStatus}. Duplicates found: ${duplicateOf.length}`);

      // 3. Auto-Cleanup: Delete the extra temporary thumbnails from B2 to save storage, EXCEPT thumb1!
      if (baseKey) {
        for (let i = 2; i <= 5; i++) {
          try {
            await b2Storage.deleteFile(`${baseKey}_thumb${i}.jpg`);
          } catch (delErr) {
            console.error(`[Webhook] Failed to delete thumb ${i}:`, delErr.message);
          }
        }
        console.log(`[Webhook] Auto-cleaned temporary storyboard thumbnails for asset ${newAssetId}`);
      }

    } catch (err) {
      console.error(`[Webhook] Failed to update DB for asset ${newAssetId}:`, err);
    }
  } else if (event && (event.progress || (event.data && event.data.progress))) {
    const progressVal = event.progress || (event.data && event.data.progress);
    console.log(`[Webhook] Asset ${newAssetId} transcoding progress: ${progressVal}`);
    try {
      await request.server.prisma.transcodeJob.updateMany({
        where: { assetId: newAssetId, provider: "coconut", status: "processing" },
        data: {
          providerMetadata: { progress: progressVal }
        }
      });
    } catch (err) {
      console.error(`[Webhook] Failed to update progress for asset ${newAssetId}:`, err);
    }
  } else if (event && event.event === 'job.failed') {
    try {
      await request.server.prisma.transcodeJob.updateMany({
        where: { assetId: newAssetId, provider: "coconut" },
        data: { 
          status: 'failed',
          providerMetadata: event
        }
      });
      await request.server.prisma.asset.update({
        where: { id: newAssetId },
        data: { status: 'failed' }
      });

      console.log(`[Webhook] Asset ${newAssetId} marked as failed.`);
    } catch (err) {
      console.error(`[Webhook] Failed to update DB for asset ${newAssetId}:`, err);
    }
  }

  // Always reply 200 OK to Coconut so it doesn't retry
  return reply.status(200).send("OK");
}

module.exports.checkDuplicateMediaFile = async (request, reply) => {
  try {
    const { orgId } = request.user;
    const { fileName, fileSize } = request.body;

    if (!fileName || fileSize === undefined) {
      return reply.code(400).send({ error: "fileName and fileSize are required" });
    }

    // Check if an active file with the exact same name and size exists
    const existingAsset = await request.server.prisma.asset.findFirst({
      where: {
        orgId: orgId,
        deletedAt: null,
        title: fileName,
        files: {
          some: {
            fileClass: "original",
            sizeBytes: BigInt(fileSize)
          }
        }
      }
    });

    if (existingAsset) {
      return reply.send({ isDuplicate: true, message: "Duplicate video: video already exists" });
    }

    return reply.send({ isDuplicate: false });

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to check for duplicates" });
  }
};