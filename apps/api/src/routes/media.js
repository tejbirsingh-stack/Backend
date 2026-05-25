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
<<<<<<< HEAD
  const fs = require("fs");
  const path = require("path");

  /** @param {Record<string, any>} queryParams */
  function buildMediaList(queryParams) {
    const {
      query,
      q,
=======
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
    const thumbnail = normalizedType === "image" ? asset.url : asset.thumbnail || null;

    return {
      id: asset.id,
      name: asset.name,
      type: normalizedType,
      size: asset.size,
      uploadDate,
      url: asset.url,
      thumbnail,
      tags: asset.tags || [],
      metadata: asset.metadata || {},
      compressionStatus: asset.compressionStatus || "completed",
    };
  }

  // Get media assets - return real uploaded files
  fastify.get("/", async (request, reply) => {
    const {
      query,
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
      type,
      sortBy,
      sortOrder,
      limit = 20,
      offset = 0,
<<<<<<< HEAD
    } = queryParams;
    const searchText = q != null && q !== "" ? q : query;

    const uploadsDir = path.join(__dirname, "../../uploads");
    let realAssets = [];

    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      realAssets = files.map((filename) => {
        const filepath = path.join(uploadsDir, filename);
        const stats = fs.statSync(filepath);
        const originalName = filename.replace(/^\d+-/, ""); // Remove timestamp prefix

        return {
          id: filename,
          name: originalName,
          type: path.extname(filename).toLowerCase().includes("mp4")
            ? "video/mp4"
            : path.extname(filename).toLowerCase().includes("png")
            ? "image/png"
            : path.extname(filename).toLowerCase().includes("jpg")
            ? "image/jpeg"
            : path.extname(filename).toLowerCase().includes("mp3")
            ? "audio/mp3"
            : "application/octet-stream",
          size: stats.size,
          uploadDate: stats.mtime.toISOString(),
          url: `/uploads/${filename}`,
          thumbnail: path.extname(filename).toLowerCase().includes("mp4")
            ? null
            : `/uploads/${filename}`,
        };
      });
    }

    const mockAssets =
      realAssets.length === 0
        ? [
            {
              id: "1",
              name: "Project Video.mp4",
              type: "video/mp4",
              size: 125000000,
              uploadDate: "2025-07-31T10:00:00Z",
              url: "/uploads/project-video.mp4",
              thumbnail: "/uploads/thumbnails/project-video.jpg",
            },
            {
              id: "2",
              name: "Design Mockup.png",
              type: "image/png",
              size: 2500000,
              uploadDate: "2025-07-30T15:30:00Z",
              url: "/uploads/design-mockup.png",
              thumbnail: "/uploads/design-mockup.png",
            },
            {
              id: "3",
              name: "Audio Track.mp3",
              type: "audio/mp3",
              size: 8200000,
              uploadDate: "2025-07-29T09:15:00Z",
              url: "/uploads/audio-track.mp3",
            },
            {
              id: "4",
              name: "Report.pdf",
              type: "application/pdf",
              size: 1800000,
              uploadDate: "2025-07-28T14:20:00Z",
              url: "/uploads/report.pdf",
            },
          ]
        : [];

    let allAssets = [...realAssets, ...mockAssets];

    if (searchText) {
      const s = String(searchText).toLowerCase();
      allAssets = allAssets.filter((asset) =>
        asset.name.toLowerCase().includes(s)
      );
    }

    if (type && type !== "All") {
      allAssets = allAssets.filter((asset) => {
        switch (type) {
          case "Video":
            return asset.type.startsWith("video/");
          case "Images":
            return asset.type.startsWith("image/");
          case "Audio":
            return asset.type.startsWith("audio/");
          case "Document":
            return asset.type === "application/pdf";
          default:
            return true;
        }
      });
    }

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

    const start = parseInt(offset, 10) || 0;
    const end = start + (parseInt(limit, 10) || 20);
    const paginatedAssets = allAssets.slice(start, end);

    return {
      data: paginatedAssets,
      meta: {
        total: allAssets.length,
        limit: parseInt(limit, 10) || 20,
        offset: parseInt(offset, 10) || 0,
        hasMore: end < allAssets.length,
      },
    };
  }

  const sendMediaList = (request, reply) => {
    try {
      reply.send(buildMediaList(request.query));
    } catch (error) {
      console.error("Error reading uploaded files:", error);
      reply.code(500).send({
=======
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
            url: `/uploads/${filename}`,
            thumbnail: mimeType.startsWith("image/") ? `/uploads/${filename}` : null,
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

      let allAssets = [...localAssets, ...b2Assets, ...mockAssets];

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
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
        error: "Failed to retrieve media assets",
        message: error.message,
      });
    }
<<<<<<< HEAD
  };

  // Get media assets - return real uploaded files
  fastify.get("/", sendMediaList);

  // Same listing as / (flat uploads dir); must be registered before /:id or "folder" is treated as an id
  fastify.get("/folder", sendMediaList);

  fastify.get("/search", (request, reply) => {
    try {
      reply.send(
        buildMediaList({ ...request.query, query: request.query.q })
      );
    } catch (error) {
      console.error("Error reading uploaded files:", error);
      reply.code(500).send({
        error: "Failed to retrieve media assets",
        message: error.message,
=======
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
              url: `/uploads/${filename}`,
              thumbnail: mimeType.startsWith("image/")
                ? `/uploads/${filename}`
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
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
      });
    }
  });

  // Get single media asset
  fastify.get("/:id", async (request, reply) => {
<<<<<<< HEAD
    const mockAsset = {
      id: request.params.id,
      name: "Sample Video.mp4",
      type: "video/mp4",
      size: 125000000,
      uploadDate: "2025-07-31T10:00:00Z",
      url: "/uploads/sample-video.mp4",
      thumbnail: "/uploads/thumbnails/sample-video.jpg",
      metadata: {
        duration: 120,
        resolution: "1920x1080",
        framerate: 30,
        codec: "h264",
      },
    };

    reply.send(mockAsset);
=======
    try {
      const fs = require("fs");
      const path = require("path");
      const { id } = request.params;
      const uploadsDir = path.join(__dirname, "../../uploads");

      if (!fs.existsSync(uploadsDir)) {
        return reply.code(404).send({
          success: false,
          error: "File not found",
        });
      }

      const files = fs.readdirSync(uploadsDir);

      // Try exact filename match first, then original name match (timestamp stripped)
      const matchedFile = files.find((filename) => {
        if (filename === id) return true;
        const originalName = filename.replace(/^\d+-/, "");
        return originalName === id;
      });

      if (!matchedFile) {
        return reply.code(404).send({
          success: false,
          error: "File not found",
        });
      }

      const filepath = path.join(uploadsDir, matchedFile);
      const stats = fs.statSync(filepath);
      const mimeType = inferMimeType(matchedFile);

      const asset = toFrontendAssetShape({
        id: matchedFile,
        name: matchedFile.replace(/^\d+-/, ""),
        mimeType,
        size: stats.size,
        uploadDate: stats.mtime.toISOString(),
        url: `/api/uploads/${matchedFile}`,
        thumbnail: mimeType.startsWith("image/") ? `/api/uploads/${matchedFile}` : null,
        tags: [],
        metadata: {},
        compressionStatus: "completed",
      });

      return reply.send({
        success: true,
        asset,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to retrieve media asset",
        message: error.message,
      });
    }
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
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
      const uploadedFiles = [];
<<<<<<< HEAD
=======
      const uploadOptions = {
        destination: "both",
      };
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec

      for await (const part of parts) {
        if (part.file) {
          const filename = `${Date.now()}-${part.filename}`;
          const filepath = path.join(uploadsDir, filename);

          // Save the file
          await pipeline(part.file, fs.createWriteStream(filepath));

          const stats = fs.statSync(filepath);
<<<<<<< HEAD
          const fileInfo = {
            id: filename,
            name: part.filename,
            type: part.mimetype,
            size: stats.size,
            uploadDate: new Date().toISOString(),
            url: `/uploads/${filename}`,
            thumbnail: part.mimetype.startsWith("image/")
              ? `/uploads/${filename}`
              : null,
          };
=======
          let b2Result = null;

          if ((uploadOptions.destination === "b2" || uploadOptions.destination === "both") && b2Storage.isEnabled()) {
            try {
              const b2Key = `uploads/${filename}`;
              b2Result = await b2Storage.uploadFile(filepath, b2Key, {
                originalName: part.filename,
              });
            } catch (b2Error) {
              console.error("B2 upload failed:", b2Error.message);
              if (uploadOptions.destination === "b2") {
                throw new Error(`B2 upload failed: ${b2Error.message}`);
              }
            }
          }

          const fileInfo = toFrontendAssetShape({
            id: filename,
            name: part.filename,
            mimeType: part.mimetype,
            size: stats.size,
            uploadDate: new Date().toISOString(),
            url: `/api/uploads/${filename}`,
            thumbnail: part.mimetype.startsWith("image/") ? `/api/uploads/${filename}` : null,
            tags: [],
            metadata: {},
            compressionStatus: "completed",
          });

          fileInfo.storageLocation = b2Result ? "both" : "local";
          fileInfo.b2Url = b2Result?.url || null;
          fileInfo.b2Key = b2Result?.key || null;
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec

          uploadedFiles.push(fileInfo);

          // Log upload success
          console.log(`File uploaded: ${part.filename} (${stats.size} bytes)`);
<<<<<<< HEAD
        }
      }

      reply.send({
        success: true,
        message: "Files uploaded successfully",
        files: uploadedFiles,
=======
        } else {
          if (part.fieldname === "destination" && part.value) {
            const destination = String(part.value).toLowerCase();
            if (["local", "b2", "both"].includes(destination)) {
              uploadOptions.destination = destination;
            }
          }
        }
      }

      if (uploadedFiles.length === 0) {
        return reply.code(400).send({
          success: false,
          message: "No files uploaded",
        });
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
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
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
<<<<<<< HEAD
  fastify.delete("/:id", async (request, reply) => {
    // Simulate successful deletion
    reply.code(204).send();
=======
  fastify.delete("/:filename", async (request, reply) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const { filename } = request.params;
      const uploadsDir = path.join(__dirname, "../../uploads");
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({
          success: false,
          error: "File not found",
        });
      }

      fs.unlinkSync(filePath);

      return reply.send({
        success: true,
        message: "File deleted successfully",
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
  });

  done();
};
