/**
 * @swagger
 * tags:
 *   name: Media Assets
 *   description: Media asset management endpoints
 */

const { dir } = require("console");
const { request } = require("http");

/**
 * @swagger
 * /media:
 *   get:
 *     summary: Get all media assets
 *     description: Retrieve a list of all media assets with optional filtering and sorting
 *     tags: [Media Assets]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query string
 *         example: brand campaign
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [All, Video, Images, Audio, Document]
 *         description: Filter by media type
 *         example: Video
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, name, type, size]
 *         description: Field to sort by
 *         example: date
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *         example: desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results
 *         example: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of results to skip
 *         example: 0
 *     responses:
 *       200:
 *         description: List of media assets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MediaAsset'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     hasMore:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 *   post:
 *     summary: Upload new media assets
 *     description: Upload one or more media files
 *     tags: [Media Assets]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Files uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Files uploaded successfully
 *                 uploaded:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MediaAsset'
 *       400:
 *         description: Bad request - invalid file type or size
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /media/{id}:
 *   get:
 *     summary: Get a specific media asset
 *     description: Retrieve details of a specific media asset by ID
 *     tags: [Media Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Media asset ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Media asset details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaAsset'
 *       404:
 *         description: Media asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 *   delete:
 *     summary: Delete a media asset
 *     description: Permanently delete a media asset
 *     tags: [Media Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Media asset ID
 *         example: 1
 *     responses:
 *       204:
 *         description: Media asset deleted successfully
 *       404:
 *         description: Media asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

module.exports = function (fastify, opts, done) {
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
    // Mask specific B2 key error format to prevent leaking key IDs
    let sanitized = message.replace(/The key '[^']+' is not valid/gi, "The key is not valid");
    // Mask any other potential 20-35 character key-like strings
    sanitized = sanitized.replace(/\b[a-zA-Z0-9]{20,35}\b/g, "[MASKED]");
    return sanitized;
  }

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
      compressionStatus: asset.compressionStatus || "completed",
    };
  }

  const fs = require("fs");
  const path = require("path");

  function getUploadsDir() {
    return path.join(__dirname, "../../uploads");
  }

  /** Recursive function to get all files in nested directories */
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

  // Find stored file path on disk from id or display name ****
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

  async function resolveMediaFilePath(id) {
    if (id && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      try {
        const asset = await fastify.prisma.mediaAsset.findUnique({
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

  /**
   * Stream a file to the client (used by video/audio players).
   * Supports HTTP Range requests so the browser can seek in long videos.
   */
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

  // Get media assets - return real uploaded files
  fastify.get("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const {
      query,
      type,
      sortBy,
      sortOrder,
      limit = 20,
      offset = 0,
    } = request.query;

    try {
      const userId = request.user.id;
      const orgId = request.user.orgId;

      // 1. Build database filter query
      const where = {
        deletedAt: null,
        uploadedByUserId: userId,
      };

      if (query) {
        where.fileName = {
          contains: query,
          mode: 'insensitive'
        };
      }

      if (type && type !== "All") {
        if (type === "Video") {
          where.mimeType = { startsWith: "video/" };
        } else if (type === "Images") {
          where.mimeType = { startsWith: "image/" };
        } else if (type === "Audio") {
          where.mimeType = { startsWith: "audio/" };
        } else if (type === "Document") {
          where.mimeType = { contains: "pdf" };
        }
      }

      // 2. Fetch scoped media assets from PostgreSQL database
      const dbAssets = await fastify.prisma.mediaAsset.findMany({
        where,
        orderBy: {
          createdAt: sortOrder === 'asc' ? 'asc' : 'desc'
        },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      // 3. Map database records to the frontend asset shape
      const transformedAssets = dbAssets.map(asset => {
        const fileSize = Number(asset.fileSize);
        const fileUrl = asset.cdnUrl || `/api/media/${encodeURIComponent(asset.id)}/stream`;
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

      reply.send({
        success: true,
        assets: transformedAssets,
        folders: [],
      });
    } catch (error) {
      console.error("Error reading media assets from database:", error);
      reply.code(500).send({
        success: false,
        error: "Failed to retrieve media assets",
        message: error.message,
      });
    }
  });

  // Search media assets
  fastify.get("/search", { preValidation: [fastify.authenticate] }, async (request, reply) => {
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
      const dbAssets = await fastify.prisma.mediaAsset.findMany({
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
        const fileUrl = asset.cdnUrl || `/api/media/${encodeURIComponent(asset.id)}/stream`;
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
  });

  // Stream file for preview/playback (video player uses this URL)
  fastify.get("/:filename/stream", async (request, reply) => {
    try {
      const { filename } = request.params;
      const filePath = await resolveMediaFilePath(filename);

      if (!filePath || !fs.existsSync(filePath)) {
        return reply.code(404).send({ success: false, error: "File not found" });
      }

      const displayName = filename.replace(/^\d+-/, "");
      return serveMediaFile(request, reply, filePath, {
        download: false,
        displayName,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to stream file",
        message: error.message,
      });
    }
  });

  // Download file (browser saves to disk)
  fastify.get("/:filename/download", async (request, reply) => {
    try {
      const { filename } = request.params;
      const filePath = await resolveMediaFilePath(filename);

      if (!filePath || !fs.existsSync(filePath)) {
        return reply.code(404).send({ success: false, error: "File not found" });
      }

      const displayName = filename.replace(/^\d+-/, "");
      return serveMediaFile(request, reply, filePath, {
        download: true,
        displayName,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to download file",
        message: error.message,
      });
    }
  });

  // List soft-deleted files (Trash)
  fastify.get("/trash", { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const userId = request.user.id;

      // Fetch soft-deleted assets from PostgreSQL database
      const dbAssets = await fastify.prisma.mediaAsset.findMany({
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
        const fileUrl = asset.cdnUrl || `/api/media/${encodeURIComponent(asset.id)}/stream`;
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
  });

  // Restore a soft-deleted file
  fastify.post("/:filename/restore", { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { filename } = request.params;
      
      let restoredFromDb = false;

      // 1. If it's a database UUID, restore in PostgreSQL database
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        try {
          await fastify.prisma.mediaAsset.update({
            where: { id: filename },
            data: { deletedAt: null }
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
  });

  // Permanently delete a file from B2
  fastify.delete("/:filename/permanent", async (request, reply) => {
    try {
      const { filename } = request.params;
      
      let deletedFromLocal = false;
      let deletedFromB2 = false;

      // Try deleting local duplicates just in case
      let filePath = await resolveMediaFilePath(filename);
      while (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFromLocal = true;
        filePath = await resolveMediaFilePath(filename);
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
          await fastify.prisma.mediaAsset.delete({
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
  });

  // GET /api/media/:filename — file bytes for players, or ?meta=true for JSON info
  fastify.get("/:filename", async (request, reply) => {
    try {
      const { filename } = request.params;
      const wantsMeta =
        request.query.meta === "true" || request.query.meta === "1";

      if (wantsMeta) {
        // Look up by UUID first
        let dbAsset;
        if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          dbAsset = await fastify.prisma.mediaAsset.findUnique({
            where: { id: filename }
          });
        }

        if (dbAsset) {
          const fileSize = Number(dbAsset.fileSize);
          const fileUrl = dbAsset.cdnUrl || `/api/media/${encodeURIComponent(dbAsset.id)}/stream`;
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
              compressionStatus: dbAsset.transcodingStatus || "completed",
            }
          });
        }

        const storedName = resolveMediaFilename(filename);
        const filePath = await resolveMediaFilePath(filename);
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

      const filePath = await resolveMediaFilePath(filename);
      if (!filePath || !fs.existsSync(filePath)) {
        return reply.code(404).send({ success: false, error: "File not found" });
      }

      const displayName = filename.replace(/^\d+-/, "");
      return serveMediaFile(request, reply, filePath, {
        download: false,
        displayName,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to serve file",
        message: error.message,
      });
    }
  });

  // Upload media asset
  // fastify.post("/upload", async (request, reply) => {
  fastify.post("/upload", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const util = require("util");
      const pipeline = util.promisify(require("stream").pipeline);

      const role = (request.user && request.user.role) ? request.user.role : "member";
      const isolationTier = (role === "super_admin" || role === "admin" || role === "system_admin") ? "internal" : "external";

      // Generate data-based subfolder (YYYY-MM-DD)
      // This creates a string like "2026-05-28" which acts as our daily directory folder 
      const today = new Date().toISOString().split("T")[0];

      // Build a dynamic file path and ensure it exists
      const uploadsDir = path.join(__dirname,"../../uploads",isolationTier,today);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const parts = request.parts();
      const tempFiles = [];
      const uploadOptions = {
        destination: b2Storage.isEnabled() ? "b2" : "local",
      };

      for await (const part of parts) {
        if (part.file) {
          const filename = `${Date.now()}-${part.filename}`;
          
          if (uploadOptions.destination === "b2" && b2Storage.isEnabled()) {
            // Direct stream to B2 without touching local disk
            console.log(`Streaming directly to B2: ${filename}`);
            let size = 0;
            part.file.on('data', (chunk) => {
              size += chunk.length;
            });
            
            // Also apply the isolation path structure to Cloud Storage (B2)
            const b2Key = `uploads/${isolationTier}/${today}/${filename}`; 
            try {
              const b2Result = await b2Storage.uploadStream(part.file, b2Key, part.mimetype, {
                originalName: part.filename,
              });
              
              tempFiles.push({
                isDirectB2: true,
                filename,
                originalName: part.filename,
                mimetype: part.mimetype,
                size, // calculated from stream chunks
                b2Result
              });
            } catch (err) {
              console.error("Direct B2 stream failed:", err);
              throw new Error(`B2 upload failed: ${sanitizeB2ErrorMessage(err.message)}`);
            }
          } else {
            // Save to local disk first
            const filepath = path.join(uploadsDir, filename);
            await pipeline(part.file, fs.createWriteStream(filepath));

            const stats = fs.statSync(filepath);
            tempFiles.push({
              isDirectB2: false,
              filepath,
              filename,
              originalName: part.filename,
              mimetype: part.mimetype,
              size: stats.size,
            });
          }
        } else {
          if (part.fieldname === "destination") {
            let val = part.value;
            if (typeof val === 'object' && val !== null) {
               val = val.value || JSON.stringify(val);
            }
            const destination = String(val).toLowerCase().trim();
            // Force B2 if enabled, otherwise fallback to local
            const resolvedDestination = b2Storage.isEnabled() ? "b2" : "local";
            uploadOptions.destination = resolvedDestination;
            console.log(`Upload destination forced to: ${resolvedDestination} (client requested: ${destination})`);
          }
        }
      }

      if (tempFiles.length === 0) {
        return reply.code(400).send({
          success: false,
          message: "No files uploaded",
        });
      }

      const uploadedFiles = [];
      for (const file of tempFiles) {
        let b2Result = file.b2Result || null;

        if (!file.isDirectB2 && (uploadOptions.destination === "b2" || uploadOptions.destination === "both") && b2Storage.isEnabled()) {
          try {
            // Fallback path for Cloud Storage (B2)
            const b2Key = `uploads/${isolationTier}/${today}/${file.filename}`;
            b2Result = await b2Storage.uploadFile(file.filepath, b2Key, {
              originalName: file.originalName,
            });

            // If strictly B2 (but landed here for some reason), delete local file
            if (uploadOptions.destination === "b2" && b2Result) {
              try {
                fs.unlinkSync(file.filepath);
                console.log(`Local file deleted after upload (B2-only mode fallback): ${file.filepath}`);
              } catch (unlinkErr) {
                console.error(`Failed to delete local file ${file.filepath}:`, unlinkErr);
              }
            }
          } catch (b2Error) {
            console.error("B2 upload failed:", b2Error.message);
            if (uploadOptions.destination === "b2") {
              // Try to delete local file even on B2 failure if strictly B2? 
              // Usually we want to keep it or handle it, but let's throw.
              throw new Error(`B2 upload failed: ${sanitizeB2ErrorMessage(b2Error.message)}`);
            }
          }
        }

        const b2Url = b2Result?.url || null;
        const b2Key = b2Result?.key || null;
        const storageLocation = b2Result ? (uploadOptions.destination === "b2" ? "b2" : "both") : "local";
        const fileUrl = uploadOptions.destination === "b2" && b2Url 
          ? b2Url 
          : `/api/media/${file.filename}/stream`;

        // Write the media asset to PostgreSQL database
        const dbAsset = await fastify.prisma.mediaAsset.create({
          data: {
            orgId: request.user.orgId,
            fileName: file.originalName,
            filePath: file.isDirectB2 ? (b2Key || '') : (file.filepath || ''),
            fileSize: BigInt(file.size),
            originalSize: BigInt(file.size),
            mimeType: file.mimetype,
            b2FileId: b2Result?.fileId || null,
            cdnUrl: fileUrl,
            uploadedByUserId: request.user.id,
            status: "ready",
            metadata: {
              tags: [],
              storageLocation,
              b2Url,
              b2Key,
              localFilename: file.filename
            }
          }
        });

        const fileInfo = {
          id: dbAsset.id, // Return the newly created database UUID!
          name: dbAsset.fileName,
          type: normalizeAssetType(dbAsset.mimeType),
          size: Number(dbAsset.fileSize),
          uploadDate: dbAsset.createdAt.toISOString(),
          url: dbAsset.cdnUrl || `/api/media/${encodeURIComponent(dbAsset.id)}/stream`,
          thumbnail: normalizeAssetType(dbAsset.mimeType) === "image" ? (dbAsset.cdnUrl || `/api/media/${encodeURIComponent(dbAsset.id)}/stream`) : null,
          tags: [],
          metadata: dbAsset.metadata || {},
          compressionStatus: "completed",
          storageLocation,
        };

        uploadedFiles.push(fileInfo);

        // Log upload success
        console.log(`File uploaded and saved to DB: ${file.originalName} (${file.size} bytes)`);
      }

      reply.send({
        success: true,
        message: "Files uploaded successfully",
        asset: uploadedFiles[0],
        files: uploadedFiles,
        uploadedTo: {
          local:
            uploadOptions.destination === "local" ||
            uploadOptions.destination === "both",
          b2:
            uploadOptions.destination === "b2" ||
            uploadOptions.destination === "both",
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      reply.code(500).send({
        success: false,
        message: "Upload failed",
        error: error.message,
      });
    }
  });

  // Delete media asset
  fastify.delete("/:filename", { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { filename } = request.params;
      
      let deletedFromLocal = false;
      let deletedFromB2 = false;

      // If it's a database UUID, soft-delete it in the database
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        try {
          await fastify.prisma.mediaAsset.update({
            where: { id: filename },
            data: { deletedAt: new Date() }
          });
        } catch (dbErr) {
          console.warn("Could not soft delete asset in database:", dbErr.message);
        }
      }

      // 1. Try deleting from local
      let filePath = await resolveMediaFilePath(filename);
      // Delete all local files with that name in case of duplicates across folders
      while (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFromLocal = true;
        
        // Temporarily rename or mock so resolveMediaFilePath can find any other duplicates
        // Actually, resolveMediaFilename will just return null if the file is deleted
        filePath = await resolveMediaFilePath(filename);
      }

      // 2. Try deleting from B2
      if (b2Storage.isEnabled()) {
        try {
          // B2 keys usually start with 'uploads/' and contain subfolders like 'internal/2026-05-28/'
          // We need to search for the exact key
          const b2Files = await b2Storage.searchFiles(filename);
          const exactMatch = b2Files.find(f => path.basename(f.key) === filename || path.basename(f.key) === filename.replace(/^\d+-/, ""));
          
          if (exactMatch) {
            await b2Storage.deleteFile(exactMatch.key);
            deletedFromB2 = true;
          } else {
            // Fallback: try deleting the direct key
            const cleanKey = filename.startsWith("uploads/") ? filename : `uploads/${filename}`;
            await b2Storage.deleteFile(cleanKey);
            // This might create a delete marker, but it's a fallback.
            deletedFromB2 = true;
          }
        } catch (b2Error) {
          console.warn(`Failed to delete key ${filename} from B2:`, b2Error.message);
        }
      }

      if (!deletedFromLocal && !deletedFromB2) {
        return reply.code(404).send({
          success: false,
          error: "File not found on local disk or B2 storage",
        });
      }

      return reply.send({
        success: true,
        message: "File deleted successfully",
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
  });


  done();
};
