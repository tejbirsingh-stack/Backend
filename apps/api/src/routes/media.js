/**
 * @swagger
 * tags:
 *   name: Media Assets
 *   description: Media asset management endpoints
 */

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

  /** Find stored filename on disk from id or display name */
  function resolveMediaFilename(id) {
    const uploadsDir = getUploadsDir();
    if (!fs.existsSync(uploadsDir)) return null;

    const files = fs.readdirSync(uploadsDir);
    const matched = files.find((filename) => {
      if (filename === id) return true;
      const originalName = filename.replace(/^\d+-/, "");
      return originalName === id;
    });
    return matched || null;
  }

  function resolveMediaFilePath(id) {
    const filename = resolveMediaFilename(id);
    if (!filename) return null;
    return path.join(getUploadsDir(), filename);
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
  fastify.get("/", async (request, reply) => {
    const {
      query,
      type,
      sortBy,
      sortOrder,
      limit = 20,
      offset = 0,
      source = "all",
    } = request.query;

    try {
      const fs = require("fs");
      const path = require("path");

      // Get real uploaded files (local)
      const uploadsDir = path.join(__dirname, "../../uploads");
      let localAssets = [];
      let b2Assets = [];

      if ((source === "local" || source === "all") && fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        localAssets = files.map((filename) => {
          const filepath = path.join(uploadsDir, filename);
          const stats = fs.statSync(filepath);
          const originalName = filename.replace(/^\d+-/, ""); // Remove timestamp prefix
          const mimeType = inferMimeType(filename);

          return {
            id: filename,
            name: originalName,
            mimeType,
            size: stats.size,
            uploadDate: stats.mtime.toISOString(),
            url: `/api/media/${encodeURIComponent(filename)}/stream`,
            thumbnail: mimeType.startsWith("image/")
              ? `/api/media/${encodeURIComponent(filename)}/stream`
              : null,
            tags: [],
            metadata: {},
            compressionStatus: "completed",
            storageLocation: "local",
          };
        });
      }

      // Get B2 assets (same presigned URL behavior as express server path)
      if ((source === "b2" || source === "all") && b2Storage.isEnabled()) {
        try {
          const b2Files = await b2Storage.listFiles("uploads/", 1000);
          b2Assets = await b2Storage.transformToMediaAssets(b2Files);
        } catch (b2Error) {
          console.error("Error listing B2 files:", b2Error.message);
        }
      }

      // Add some mock data if no real files exist
      const mockAssets =
        localAssets.length === 0 && b2Assets.length === 0
          ? [
              {
                id: "1",
                name: "Project Video.mp4",
                mimeType: "video/mp4",
                size: 125000000,
                uploadDate: "2025-07-31T10:00:00Z",
                url: "/uploads/project-video.mp4",
                thumbnail: "/uploads/thumbnails/project-video.jpg",
                tags: [],
                metadata: {},
                compressionStatus: "completed",
              },
              {
                id: "2",
                name: "Design Mockup.png",
                mimeType: "image/png",
                size: 2500000,
                uploadDate: "2025-07-30T15:30:00Z",
                url: "/uploads/design-mockup.png",
                thumbnail: "/uploads/design-mockup.png",
                tags: [],
                metadata: {},
                compressionStatus: "completed",
              },
              {
                id: "3",
                name: "Audio Track.mp3",
                mimeType: "audio/mpeg",
                size: 8200000,
                uploadDate: "2025-07-29T09:15:00Z",
                url: "/uploads/audio-track.mp3",
                thumbnail: null,
                tags: [],
                metadata: {},
                compressionStatus: "completed",
              },
              {
                id: "4",
                name: "Report.pdf",
                mimeType: "application/pdf",
                size: 1800000,
                uploadDate: "2025-07-28T14:20:00Z",
                url: "/uploads/report.pdf",
                thumbnail: null,
                tags: [],
                metadata: {},
                compressionStatus: "completed",
              },
            ]
          : [];

      const combinedAssets = [...localAssets, ...b2Assets, ...mockAssets];
      const deduplicatedAssets = [];
      const seenIds = new Set();
      
      for (const asset of combinedAssets) {
        if (!seenIds.has(asset.id)) {
          seenIds.add(asset.id);
          
          const isLocal = localAssets.some(l => l.id === asset.id);
          const isB2 = b2Assets.some(b => b.id === asset.id);
          if (isLocal && isB2) {
            asset.storageLocation = "both";
          }
          
          deduplicatedAssets.push(asset);
        }
      }
      
      let allAssets = deduplicatedAssets;

      // Apply search filter
      if (query) {
        allAssets = allAssets.filter((asset) =>
          asset.name.toLowerCase().includes(query.toLowerCase())
        );
      }

      // Apply type filter
      if (type && type !== "All") {
        allAssets = allAssets.filter((asset) => {
          const mimeType = asset.mimeType || inferMimeType(asset.name || "");
          switch (type) {
            case "Video":
              return mimeType.startsWith("video/");
            case "Images":
              return mimeType.startsWith("image/");
            case "Audio":
              return mimeType.startsWith("audio/");
            case "Document":
              return mimeType === "application/pdf";
            default:
              return true;
          }
        });
      }

      // Apply sorting
      if (sortBy) {
        allAssets.sort((a, b) => {
          let compareValue = 0;
          switch (sortBy) {
            case "name":
              compareValue = a.name.localeCompare(b.name);
              break;
            case "size":
              compareValue = a.size - b.size;
              break;
            case "date":
              compareValue =
                new Date(a.uploadDate).getTime() -
                new Date(b.uploadDate).getTime();
              break;
          }
          return sortOrder === "desc" ? -compareValue : compareValue;
        });
      }

      // Apply pagination
      const start = parseInt(offset) || 0;
      const end = start + (parseInt(limit) || 20);
      const paginatedAssets = allAssets.slice(start, end);
      const transformedAssets = paginatedAssets.map(toFrontendAssetShape);

      reply.send({
        success: true,
        assets: transformedAssets,
        folders: [],
      });
    } catch (error) {
      console.error("Error reading uploaded files:", error);
      reply.code(500).send({
        success: false,
        error: "Failed to retrieve media assets",
        message: error.message,
      });
    }
  });

  // Get single media asset
  fastify.get("/search", async (request, reply) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const { q: query = "", source = "all" } = request.query;

      if (!query || !String(query).trim()) {
        return reply.code(400).send({
          success: false,
          error: "Search query is required",
          assets: [],
        });
      }

      const searchLower = String(query).toLowerCase();
      const uploadsDir = path.join(__dirname, "../../uploads");
      let assets = [];

      // Local search (current parity phase)
      if ((source === "local" || source === "all") && fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);

        assets = files
          .map((filename) => {
            const filepath = path.join(uploadsDir, filename);
            const stats = fs.statSync(filepath);
            const mimeType = inferMimeType(filename);
            const originalName = filename.replace(/^\d+-/, "");

            return toFrontendAssetShape({
              id: filename,
              name: originalName,
              mimeType,
              size: stats.size,
              uploadDate: stats.mtime.toISOString(),
              url: `/api/media/${encodeURIComponent(filename)}/stream`,
              thumbnail: mimeType.startsWith("image/")
                ? `/api/media/${encodeURIComponent(filename)}/stream`
                : null,
              tags: [],
              metadata: {},
              compressionStatus: "completed",
            });
          })
          .filter((asset) => {
            const typeMatch = String(asset.type || "")
              .toLowerCase()
              .includes(searchLower);
            const nameMatch = String(asset.name || "")
              .toLowerCase()
              .includes(searchLower);
            const tagMatch = Array.isArray(asset.tags)
              ? asset.tags.some((tag) => String(tag).toLowerCase().includes(searchLower))
              : false;

            return nameMatch || typeMatch || tagMatch;
          });
      }

      return reply.send({
        success: true,
        assets,
        query: String(query),
        count: assets.length,
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
      const filePath = resolveMediaFilePath(filename);

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
      const filePath = resolveMediaFilePath(filename);

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

  // GET /api/media/:filename — file bytes for players, or ?meta=true for JSON info
  fastify.get("/:filename", async (request, reply) => {
    try {
      const { filename } = request.params;
      const wantsMeta =
        request.query.meta === "true" || request.query.meta === "1";

      if (wantsMeta) {
        const storedName = resolveMediaFilename(filename);
        const filePath = resolveMediaFilePath(filename);
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

      const filePath = resolveMediaFilePath(filename);
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
  fastify.post("/upload", async (request, reply) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const util = require("util");
      const pipeline = util.promisify(require("stream").pipeline);

      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, "../../uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const parts = request.parts();
      const tempFiles = [];
      const uploadOptions = {
        destination: "both",
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
            
            const b2Key = `uploads/${filename}`;
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
              throw new Error(`B2 upload failed: ${err.message}`);
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
            // fastify-multipart gives the value on part.value, sometimes as an object if JSON
            let val = part.value;
            if (typeof val === 'object' && val !== null) {
               val = val.value || JSON.stringify(val);
            }
            const destination = String(val).toLowerCase().trim();
            if (["local", "b2", "both"].includes(destination)) {
              uploadOptions.destination = destination;
              console.log(`Upload destination set to: ${destination}`);
            }
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
            const b2Key = `uploads/${file.filename}`;
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
              throw new Error(`B2 upload failed: ${b2Error.message}`);
            }
          }
        }

        const fileInfo = toFrontendAssetShape({
          id: file.filename,
          name: file.originalName,
          mimeType: file.mimetype,
          size: file.size,
          uploadDate: new Date().toISOString(),
          url: uploadOptions.destination === "b2" && b2Result?.url 
            ? b2Result.url 
            : `/api/media/${encodeURIComponent(file.filename)}/stream`,
          thumbnail: file.mimetype.startsWith("image/")
            ? (uploadOptions.destination === "b2" && b2Result?.url ? b2Result.url : `/api/media/${encodeURIComponent(file.filename)}/stream`)
            : null,
          tags: [],
          metadata: {},
          compressionStatus: "completed",
        });

        fileInfo.storageLocation = b2Result ? (uploadOptions.destination === "b2" ? "b2" : "both") : "local";
        fileInfo.b2Url = b2Result?.url || null;
        fileInfo.b2Key = b2Result?.key || null;

        uploadedFiles.push(fileInfo);

        // Log upload success
        console.log(`File uploaded: ${file.originalName} (${file.size} bytes)`);
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
  fastify.delete("/:filename", async (request, reply) => {
    try {
      const { filename } = request.params;
      
      let deletedFromLocal = false;
      let deletedFromB2 = false;

      // 1. Try deleting from local
      const filePath = resolveMediaFilePath(filename);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedFromLocal = true;
      }

      // 2. Try deleting from B2
      if (b2Storage.isEnabled()) {
        try {
          // B2 keys usually start with 'uploads/'
          const cleanKey = filename.startsWith("uploads/") ? filename : `uploads/${filename}`;
          // Delete from B2
          await b2Storage.deleteFile(cleanKey);
          deletedFromB2 = true;
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
