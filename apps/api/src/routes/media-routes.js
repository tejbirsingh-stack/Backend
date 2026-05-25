const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const MediaAssetService = require("../services/media-asset.service");

// Initialize media asset service
const mediaAssetService = new MediaAssetService();
// Ensure uploads directory exists
async function ensureUploadsDir() {
  const uploadDir = path.join(process.cwd(), "uploads");
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    return uploadDir;
  } catch (error) {
    console.error("Error creating uploads directory:", error);
    throw error;
  }
}

async function mediaRoutes(fastify, options) {
  // Get all media assets
  fastify.get(
    "/media",
    {
      schema: {
        description: "Get all media assets with optional filtering and sorting",
        tags: ["Media Assets"],
        querystring: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query string" },
            type: {
              type: "string",
              enum: ["All", "Video", "Images", "Audio", "Document"],
              description: "Filter by media type",
            },
            sortBy: {
              type: "string",
              enum: ["name", "date", "type", "size"],
              description: "Sort field",
            },
            sortOrder: {
              type: "string",
              enum: ["asc", "desc"],
              description: "Sort order",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    type: { type: "string" },
                    size: { type: "string" },
                    date: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    filename: { type: "string" },
                    mimetype: { type: "string" },
                  },
                },
              },
              total: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const {
          query,
          type,
          sortBy = "createdAt",
          sortOrder = "desc",
        } = request.query;

        // Get the demo org for testing
        const demoOrg = await mediaAssetService.prisma.organization.findFirst({
          where: { slug: "visit-detroit" },
        });

        if (!demoOrg) {
          reply.status(404);
          return { success: false, error: "Demo organization not found" };
        }

        const assets = await mediaAssetService.getMediaAssets({
          query,
          type,
          sortBy,
          sortOrder,
          orgId: demoOrg.id,
        });

        return {
          success: true,
          data: assets,
          total: assets.length,
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500);
        return { success: false, error: "Internal server error" };
      }
    }
  );

  // Upload media files
  fastify.post(
    "/media/upload",
    {
      schema: {
        description: "Upload a media file",
        tags: ["Media Assets"],
        consumes: ["multipart/form-data"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  type: { type: "string" },
                  size: { type: "string" },
                  filename: { type: "string" },
                  mimetype: { type: "string" },
                  uploadedAt: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Handle multipart data
        const data = await request.file();

        if (!data) {
          reply.status(400);
          return { success: false, error: "No file uploaded" };
        }

        // Validate file type
        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "video/mp4",
          "video/avi",
          "video/mov",
          "video/wmv",
          "audio/mp3",
          "audio/wav",
          "audio/aac",
          "audio/ogg",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ];

        if (!allowedTypes.includes(data.mimetype)) {
          reply.status(400);
          return {
            success: false,
            error: `File type ${data.mimetype} not allowed`,
          };
        }

        // Create uploads directory
        const uploadDir = await ensureUploadsDir();

        // Generate unique filename
        const uniqueId = uuidv4();
        const extension = path.extname(data.filename);
        const filename = `${uniqueId}${extension}`;
        const filepath = path.join(uploadDir, filename);

        // Save file to disk
        const fileBuffer = await data.toBuffer();
        await fs.writeFile(filepath, fileBuffer);

        // Save asset to database
        const demoOrg = await mediaAssetService.prisma.organization.findFirst({
          where: { slug: "visit-detroit" },
        });
        const demoUser = await mediaAssetService.prisma.user.findFirst({
          where: { email: "admin@visitdetroit.com" },
        });

        if (!demoOrg || !demoUser) {
          reply.status(404);
          return {
            success: false,
            error: "Demo organization or user not found",
          };
        }

        const assetData = {
          fileName: data.filename,
          filePath: filepath,
          fileSize: fileBuffer.length,
          mimeType: data.mimetype,
          orgId: demoOrg.id,
          uploadedByUserId: demoUser.id,
          tags: ["uploaded", "new"],
        };

        const newAsset = await mediaAssetService.createMediaAsset(assetData);

        return {
          success: true,
          message: "File uploaded successfully",
          data: newAsset,
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500);
        return { success: false, error: "Upload failed" };
      }
    }
  );

  // Get specific media asset
  fastify.get(
    "/media/:id",
    {
      schema: {
        description: "Get a specific media asset by ID",
        tags: ["Media Assets"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Media asset ID" },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  type: { type: "string" },
                  size: { type: "string" },
                  date: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  filename: { type: "string" },
                  mimetype: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const demoOrg = await mediaAssetService.prisma.organization.findFirst({
          where: { slug: "visit-detroit" },
        });

        if (!demoOrg) {
          reply.status(404);
          return { success: false, error: "Demo organization not found" };
        }

        const asset = await mediaAssetService.getMediaAsset(id, demoOrg.id);

        if (!asset) {
          reply.status(404);
          return { success: false, error: "Media asset not found" };
        }

        return {
          success: true,
          data: asset,
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500);
        return { success: false, error: "Internal server error" };
      }
    }
  );

  // Download media file
  fastify.get(
    "/media/:id/download",
    {
      schema: {
        description: "Download a media file",
        tags: ["Media Assets"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Media asset ID" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const asset = mediaAssets.find((a) => a.id === parseInt(id));

        if (!asset) {
          reply.status(404);
          return { success: false, error: "Media asset not found" };
        }

        if (
          asset.path &&
          (await fs
            .access(asset.path)
            .then(() => true)
            .catch(() => false))
        ) {
          // File exists on disk
          reply.type(asset.mimetype);
          reply.header(
            "Content-Disposition",
            `attachment; filename="${asset.name}"`
          );
          return reply.sendFile(asset.filename, path.dirname(asset.path));
        } else {
          // File not found
          reply.status(404);
          return { success: false, error: "File not found on disk" };
        }
      } catch (error) {
        fastify.log.error(error);
        reply.status(500);
        return { success: false, error: "Download failed" };
      }
    }
  );

  // Delete media asset
  fastify.delete(
    "/media/:id",
    {
      schema: {
        description: "Delete a media asset",
        tags: ["Media Assets"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Media asset ID" },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const assetIndex = mediaAssets.findIndex((a) => a.id === parseInt(id));

        if (assetIndex === -1) {
          reply.status(404);
          return { success: false, error: "Media asset not found" };
        }

        const asset = mediaAssets[assetIndex];

        // Delete file from disk if it exists
        if (asset.path) {
          try {
            await fs.unlink(asset.path);
          } catch (error) {
            fastify.log.warn(`Failed to delete file: ${asset.path}`, error);
          }
        }

        // Remove from in-memory storage
        mediaAssets.splice(assetIndex, 1);

        return {
          success: true,
          message: "Media asset deleted successfully",
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500);
        return { success: false, error: "Delete failed" };
      }
    }
  );
}

module.exports = mediaRoutes;
