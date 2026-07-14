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
      const asset = await request.server.prisma.mediaAsset.findUnique({
        where: { id }
      });
      if (asset && asset.metadata && asset.metadata.localFilename) {
        return resolveMediaFilename(asset.metadata.localFilename);
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
  let asset = null;
  if (filename && filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    asset = await request.server.prisma.mediaAsset.findUnique({
      where: { id: filename }
    });
  } else {
    const allAssets = await request.server.prisma.mediaAsset.findMany({
      where: { deletedAt: null }
    });
    asset = allAssets.find(a => 
      a.fileName === filename || 
      a.filePath === filename ||
      a.filePath.endsWith('/' + filename) ||
      (a.metadata && a.metadata.localFilename === filename) ||
      (a.customMetadata && a.customMetadata.originalFilePath === filename)
    );
  }

  if (asset) {
    const storageLocation = asset.metadata?.storageLocation || asset.status;
    let b2Key = asset.metadata?.b2Key || asset.filePath;
    
    // If the client explicitly requested the original raw file path, use that key instead of the proxy
    if (asset.customMetadata && asset.customMetadata.originalFilePath === filename) {
      b2Key = filename;
    }
    
    if ((storageLocation === "b2" || storageLocation === "both") && b2Key && b2Storage.isEnabled()) {
      const freshUrl = await b2Storage.getPresignedUrl(b2Key);
      if (freshUrl) {
        console.log(`Redirecting request for ${filename} to fresh B2 URL`);
        return reply.code(307).redirect(freshUrl);
      }
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

   

    // Build where condition
    const where = {
      orgId: orgId,
      deletedAt: null,
    };


    if (query) {
      where.fileName = {
        contains: query,
        mode: "insensitive",
      };
    }


    if (type && type !== "All") {
      if (type === "Video") {
        where.mimeType = {
          startsWith: "video/",
        };
      } else if (type === "Images") {
        where.mimeType = {
          startsWith: "image/",
        };
      } else if (type === "Audio") {
        where.mimeType = {
          startsWith: "audio/",
        };
      } else if (type === "Document") {
        where.mimeType = {
          contains: "pdf",
        };
      }
    }


    // Fetch data based on orgId
    const dbAssets = await request.server.prisma.mediaAsset.findMany({
      where,
      orderBy: {
        createdAt: sortOrder === "asc" ? "asc" : "desc",
      },
      take: Number(limit),
      skip: Number(offset),
      select: {
        id: true,
        fileName: true,
        filePath: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        metadata: true,
        status: true,
        customMetadata: true,
        transcodingStatus: true,
      },
    });


    const transformedAssets = dbAssets.map((asset) => {

      const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;

      return {
        id: asset.id,
        name: asset.fileName,
        path: asset.filePath,
        type: normalizeAssetType(asset.mimeType),
        size: Number(asset.fileSize),
        uploadDate: asset.createdAt.toISOString(),
        url: fileUrl,
        thumbnail: asset.mimeType.startsWith("image/")
          ? fileUrl
          : null,
        metadata: asset.metadata || {},
        status: asset.status,
        customMetadata: asset.customMetadata || {},
        transcodingStatus: asset.transcodingStatus,
        transcodingProgress: asset.transcodingProgress,
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
      const dbAssets = await request.server.prisma.mediaAsset.findMany({
        where: {
          uploadedByUserId: userId,
          deletedAt: null,
          fileName: {
            contains: String(query),
            mode: 'insensitive'
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const transformedAssets = dbAssets.map(asset => {
        const fileSize = Number(asset.fileSize);
        const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;
        const normalizedType = normalizeAssetType(asset.mimeType);

        return {
          id: asset.id,
          name: asset.fileName,
          type: normalizedType,
          size: fileSize,
          uploadDate: asset.createdAt.toISOString(),
          url: fileUrl,
          thumbnail: normalizedType === "image" ? fileUrl : null,
          tags: asset.metadata?.tags || [],
          metadata: asset.metadata || {},
          compressionStatus: asset.transcodingStatus || "completed",
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

//5. Download file (browser saves to disk)
module.exports.downloadFile = async (request, reply) => {
    try {
      const { filename } = request.params;
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
      const dbAssets = await request.server.prisma.mediaAsset.findMany({
        where: {
          uploadedByUserId: userId,
          deletedAt: { not: null },
        },
        orderBy: {
          deletedAt: 'desc'
        }
      });
      
      // Transform files using the same structure as active files
      const transformed = dbAssets.map(asset => {
        const fileSize = Number(asset.fileSize);
        const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;
        const normalizedType = normalizeAssetType(asset.mimeType);
        
        return {
          id: asset.id,
          name: asset.fileName,
          type: normalizedType,
          size: fileSize,
          uploadDate: asset.createdAt.toISOString(),
          deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : new Date().toISOString(),
          url: fileUrl,
          thumbnail: normalizedType === "image" ? fileUrl : null,
          tags: asset.metadata?.tags || [],
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
          await request.server.prisma.mediaAsset.update({
            where: { id: filename },
            data: { 
            deletedAt: null,
            status: "ready"
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
          await request.server.prisma.mediaAsset.delete({
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
        let dbAsset;
        if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          dbAsset = await request.server.prisma.mediaAsset.findUnique({
            where: { id: filename }
          });
        }

        if (dbAsset) {
          const fileSize = Number(dbAsset.fileSize);
          const fileUrl = `/api/media/${encodeURIComponent(dbAsset.id)}/stream`;
          const normalizedType = normalizeAssetType(dbAsset.mimeType);

          return reply.send({
            success: true,
            asset: {
              id: dbAsset.id,
              name: dbAsset.fileName,
              type: normalizedType,
              size: fileSize,
              uploadDate: dbAsset.createdAt.toISOString(),
              url: fileUrl,
              thumbnail: normalizedType === "image" ? fileUrl : null,
              tags: dbAsset.metadata?.tags || [],
              metadata: dbAsset.metadata || {},
              status: dbAsset.status,
              customMetadata: dbAsset.customMetadata || {},
              transcodingStatus: dbAsset.transcodingStatus,
              compressionStatus: dbAsset.transcodingStatus || "completed",
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

          // Write the media asset to PostgreSQL database
          const dbAsset = await request.server.prisma.mediaAsset.create({
            data: {
              orgId: request.user.orgId,
              fileName: part.filename,
              filePath: b2Key,
              fileSize: BigInt(size),
              originalSize: BigInt(size),
              mimeType: part.mimetype,
              durationSeconds: durationSeconds,
              b2FileId: b2Result?.fileId || null,
              cdnUrl: fileUrl,
              uploadedByUserId: request.user.id,
              status: isVideo ? "processing" : "ready",
              transcodingStatus: isVideo ? "processing" : null,
              metadata: {
                tags: [],
                storageLocation: "b2",
                b2Url,
                b2Key,
              }
            }
          });

          // If it's a video, queue a compression job in Redis
          if (isVideo) {
            try {
              // 5GB threshold for heavy queue
              const fiveGB = 5 * 1024 * 1024 * 1024;
              const queueToUse = size >= fiveGB ? heavyCompressionQueue : compressionQueue;
              
              await queueToUse.add("compress", {
                mediaAssetId: dbAsset.id,
                key: b2Key,
                preset: "medium", // Default to balanced H.264
              });
              console.log(`[Queue] Added video compression job for asset ${dbAsset.id} to ${size >= fiveGB ? 'heavy' : 'standard'} queue`);
            } catch (queueErr) {
              console.error(`[Queue] Failed to add job to compression queue:`, queueErr.message);
            }
          }

          const fileInfo = {
            id: dbAsset.id,
            name: dbAsset.fileName,
            type: normalizeAssetType(dbAsset.mimeType),
            size: Number(dbAsset.fileSize),
            uploadDate: dbAsset.createdAt.toISOString(),
            url: `/api/media/${encodeURIComponent(dbAsset.id)}/stream`,
            thumbnail: normalizeAssetType(dbAsset.mimeType) === "image" ? `/api/media/${encodeURIComponent(dbAsset.id)}/stream` : null,
            tags: [],
            metadata: dbAsset.metadata || {},
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
          await request.server.prisma.mediaAsset.update({
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

    // Save the asset metadata in PostgreSQL via Prisma
    const dbAsset = await request.server.prisma.mediaAsset.create({
      data: {
        orgId: request.user.orgId,
        fileName: session.fileName,
        filePath: session.key,
        fileSize: BigInt(session.fileSize),
        originalSize: BigInt(session.fileSize),
        mimeType: session.mimeType,
        durationSeconds: session.durationSeconds || null,
        b2FileId: null, // S3 multipart does not give a single B2 File ID upfront
        cdnUrl: cdnUrl,
        uploadedByUserId: request.user.id,
        status: isVideo ? "processing" : "ready",
        transcodingStatus: isVideo ? "processing" : null,
        metadata: {
          tags: [],
          storageLocation: "b2",
          b2Key: session.key,
        }
      }
    });

    // Queue compression if it's a video
    if (isVideo) {
      try {
        const fiveGB = BigInt(5 * 1024 * 1024 * 1024);
        const queueToUse = dbAsset.fileSize >= fiveGB ? heavyCompressionQueue : compressionQueue;
        await queueToUse.add("compress", {
          mediaAssetId: dbAsset.id,
          key: session.key,
          preset: "medium",
        });
        console.log(`[Queue] Added video compression job for asset ${dbAsset.id} to ${dbAsset.fileSize >= fiveGB ? 'heavy' : 'fast'} queue`);
      } catch (queueErr) {
        console.error(`[Queue] Failed to queue job for asset ${dbAsset.id}:`, queueErr.message);
      }
    }

    // Clean up Redis Sessions
    await redisClient.del(`upload:session:${sessionId}`);

    const fileInfo = {
      id: dbAsset.id,
      name: dbAsset.fileName,
      type: isVideo ? "video" : "document",
      size: Number(dbAsset.fileSize),
      uploadDate: dbAsset.createdAt.toISOString(),
      url: `/api/media/${encodeURIComponent(dbAsset.id)}/stream`,
      thumbnail: null,
      tags: [],
      metadata: dbAsset.metadata || {},
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
  const assetId = request.query.assetId;

  if (!assetId) {
    return reply.status(400).send("assetId query parameter is missing");
  }

  if (event && event.event === 'job.completed') {
    try {
      // 1. Fetch the asset
      const asset = await request.server.prisma.mediaAsset.findUnique({
        where: { id: assetId }
      });

      let duplicateOf = [];

      // Tier 1: Exact Checksum Match 
      if (asset.checksum && asset.fileSize) {
        const exactMatch = await request.server.prisma.mediaAsset.findFirst({
          where : {
            id: { not: assetId },
            checksum: asset.checksum,
            fileSize: asset.fileSize
          }
        });
        if (exactMatch) duplicateOf.push(exactMatch.id);
      }

      // If not an exact match, run the visual check
      if (duplicateOf.length === 0) {

        // Tier 2: Metadata Filter (Find Suspects)
        // If we have duration metadata, use it to narrow down suspects. Otherwise, check all videos.
        const whereClause = { id: { not: assetId } };
        if (asset.durationSeconds) {
          whereClause.durationSeconds = {
            gte: Number(asset.durationSeconds) - 2,
            lte: Number(asset.durationSeconds) + 2
          };
        }

        const suspects = await request.server.prisma.mediaAsset.findMany({
          where: whereClause,
          select: { id: true }
        });
        const suspectIds = suspects.map(s => s.id);

        // Tier 3: Storyboard pHash (The Visual Math)
        const baseKey = asset.filePath; 
        
        // 1. Download and Hash the 5 thumbnails Coconut just created
        for (let i = 1; i <= 5; i++) {
          const thumbKey = `${baseKey}_thumb${i}.jpg`;
          const thumbUrl = await b2Storage.getPresignedUrl(thumbKey, 3600); // 1-hour link
          
          if (thumbUrl) {
            try {
              // DOWNLOAD the image first to strip away the messy B2 URL parameters
              // B2 Eventual Consistency Fix: Retry up to 3 times if the file returns 404
              let fetchResponse = null;
              for (let attempt = 1; attempt <= 3; attempt++) {
                const res = await fetch(thumbUrl);
                if (res.ok) {
                  fetchResponse = res;
                  break;
                }
                if (res.status === 404 && attempt < 3) {
                  // Wait 1.5 seconds and retry
                  await new Promise(resolve => setTimeout(resolve, 1500));
                } else {
                  throw new Error(`Failed to fetch thumbnail (Status: ${res.status})`);
                }
              }
              
              if (!fetchResponse) throw new Error("Thumbnail not found in B2 after 3 attempts");

              const arrayBuffer = await fetchResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Pass the raw buffer directly to imageHash (outputs a 256-bit Hex String)
              const hashStr = await imageHashAsync({ data: buffer, name: 'thumb.jpg' }, 16, true);
              
              /* Disabled because VideoFrameHash model does not exist yet
              // Save to PostgreSQL
              await request.server.prisma.videoFrameHash.create({
                data: {
                  assetId: assetId,
                  frameIndex: i,
                  hashValue: hashStr
                }
              });
              */
            } catch(e) {
              console.error(`[Webhook] Failed to hash thumb ${i}:`, e.message);
            }
          }
        }

        // 2. PostgreSQL Hamming Distance Calculation (Updated for 256-bit Hex)
        if (suspectIds.length > 0) {
          /* Disabled because VideoFrameHash model does not exist yet
          const duplicateMatches = await request.server.prisma.$queryRawUnsafe(`
            SELECT vfh."assetId", COUNT(*) as match_count
            FROM video_frame_hashes vfh
            JOIN video_frame_hashes new_vfh ON new_vfh."frameIndex" = vfh."frameIndex"
            WHERE new_vfh."assetId" = $1::uuid 
              AND vfh."assetId" = ANY($2::uuid[])
              AND length(replace((('x' || vfh."hashValue")::bit(256) # ('x' || new_vfh."hashValue")::bit(256))::text, '0', '')) <= 15
            GROUP BY vfh."assetId"
            HAVING COUNT(*) >= 3
          `, assetId, suspectIds);
          
          duplicateMatches.forEach(match => duplicateOf.push(match.assetId));
          */
        }
      }

      // Update the database: Mark as ready OR mark as duplicate!
      const compressedKey = request.query.compressedKey;
      
      const updatedMetadata = {
        ...(typeof asset.customMetadata === 'object' ? asset.customMetadata : {}),
        duplicates: duplicateOf,
        ...(compressedKey ? { originalFilePath: asset.filePath } : {})
      };

      const updateData = {
        transcodingStatus: 'completed',
        status: duplicateOf.length > 0 ? 'duplicate' : 'ready',
        customMetadata: updatedMetadata
      };

      if (compressedKey) {
        updateData.filePath = compressedKey;
        updateData.cdnUrl = `/api/media/${encodeURIComponent(compressedKey)}/stream`;
      }

      await request.server.prisma.mediaAsset.update({
        where: { id: assetId },
        data: updateData
      });

      console.log(`[Webhook] Asset ${assetId} marked ready. Duplicates found: ${duplicateOf.length}`);

      // 3. Auto-Cleanup: Delete the 5 temporary thumbnails from B2 to save storage
      const cleanupKey = compressedKey || asset.filePath;
      if (cleanupKey) {
        for (let i = 1; i <= 5; i++) {
          try {
            await b2Storage.permanentlyDeleteFile(`${cleanupKey}_thumb${i}.jpg`);
          } catch (delErr) {
            console.error(`[Webhook] Failed to delete thumb ${i}:`, delErr.message);
          }
        }
        console.log(`[Webhook] Auto-cleaned temporary storyboard thumbnails for asset ${assetId}`);
      }

    } catch (err) {
      console.error(`[Webhook] Failed to update DB for asset ${assetId}:`, err);
    }
  } else if (event && (event.progress || (event.data && event.data.progress))) {
    try {
      // Fetch the current asset to update its customMetadata safely
      const asset = await request.server.prisma.mediaAsset.findUnique({
        where: { id: assetId },
        select: { customMetadata: true }
      });
      
      if (asset) {
        const updatedMetadata = {
          ...(typeof asset.customMetadata === 'object' ? asset.customMetadata : {}),
          transcodingProgress: event.progress || (event.data && event.data.progress) // e.g., "45%"
        };

        await request.server.prisma.mediaAsset.update({
          where: { id: assetId },
          data: {
            transcodingStatus: 'processing',
            customMetadata: updatedMetadata
          }
        });
        console.log(`[Webhook] Asset ${assetId} transcoding progress: ${event.progress || (event.data && event.data.progress)}`);
      }
    } catch (err) {
      console.error(`[Webhook] Failed to update progress for asset ${assetId}:`, err);
    }
  } else if (event && event.event === 'job.failed') {
    try {
      await request.server.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          transcodingStatus: 'failed',
          status: 'failed'
        }
      });
      console.log(`[Webhook] Asset ${assetId} marked as failed.`);
    } catch (err) {
      console.error(`[Webhook] Failed to update DB for asset ${assetId}:`, err);
    }
  }

  // Always reply 200 OK to Coconut so it doesn't retry
  return reply.status(200).send("OK");
}

/* Disabled Duplicate Check APIs per user request
module.exports.checkDuplicateMediaFile = async (request, reply) => {
  return reply.send({ isDuplicate: false });
};
*/