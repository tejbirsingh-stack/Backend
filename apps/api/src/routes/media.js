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
  const fs = require("fs");
  const path = require("path");

  /** @param {Record<string, any>} queryParams */
  function buildMediaList(queryParams) {
    const {
      query,
      q,
      type,
      sortBy,
      sortOrder,
      limit = 20,
      offset = 0,
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
        error: "Failed to retrieve media assets",
        message: error.message,
      });
    }
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
      });
    }
  });

  // Get single media asset
  fastify.get("/:id", async (request, reply) => {
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

      for await (const part of parts) {
        if (part.file) {
          const filename = `${Date.now()}-${part.filename}`;
          const filepath = path.join(uploadsDir, filename);

          // Save the file
          await pipeline(part.file, fs.createWriteStream(filepath));

          const stats = fs.statSync(filepath);
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

          uploadedFiles.push(fileInfo);

          // Log upload success
          console.log(`File uploaded: ${part.filename} (${stats.size} bytes)`);
        }
      }

      reply.send({
        success: true,
        message: "Files uploaded successfully",
        files: uploadedFiles,
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
  fastify.delete("/:id", async (request, reply) => {
    // Simulate successful deletion
    reply.code(204).send();
  });

  done();
};
