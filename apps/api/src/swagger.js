const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Noah Media Asset Management API",
      version: "1.0.0",
      description: "Enterprise-grade media asset management platform API",
      contact: {
        name: "Noah Platform Team",
        email: "api@noah.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3001/api/v1",
        description: "Development server",
      },
      {
        url: "https://api.noah.com/v1",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        MediaAsset: {
          type: "object",
          required: ["id", "name", "type", "size", "date"],
          properties: {
            id: {
              type: "integer",
              description: "Unique identifier for the media asset",
              example: 1,
            },
            name: {
              type: "string",
              description: "Display name of the media asset",
              example: "Brand Campaign Video",
            },
            type: {
              type: "string",
              enum: ["Video", "Images", "Audio", "Document"],
              description: "Type of media asset",
              example: "Video",
            },
            size: {
              type: "string",
              description: "Human-readable file size",
              example: "45.2 MB",
            },
            sizeBytes: {
              type: "integer",
              description: "File size in bytes",
              example: 47185920,
            },
            date: {
              type: "string",
              description: "Human-readable last modified date",
              example: "2 hours ago",
            },
            dateSort: {
              type: "string",
              format: "date-time",
              description: "ISO date for sorting",
              example: "2025-07-30T12:00:00Z",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Tags associated with the asset",
              example: ["brand", "campaign", "marketing"],
            },
            resolution: {
              type: "string",
              description: "Resolution for images/videos",
              example: "4K",
            },
            duration: {
              type: "string",
              description: "Duration for audio/video files",
              example: "2:34",
            },
            count: {
              type: "string",
              description: "Number of files for image collections",
              example: "24 images",
            },
            pages: {
              type: "string",
              description: "Number of pages for documents",
              example: "32 pages",
            },
            quality: {
              type: "string",
              description: "Quality setting for audio files",
              example: "High",
            },
            format: {
              type: "string",
              description: "File format for documents",
              example: "PDF",
            },
          },
        },
        UploadRequest: {
          type: "object",
          required: ["files"],
          properties: {
            files: {
              type: "array",
              items: {
                type: "string",
                format: "binary",
              },
              description: "Array of files to upload",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Optional tags to apply to uploaded assets",
              example: ["uploaded", "new"],
            },
          },
        },
        SearchRequest: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query string",
              example: "brand campaign",
            },
            type: {
              type: "string",
              enum: ["All", "Video", "Images", "Audio", "Document"],
              description: "Filter by media type",
              example: "Video",
            },
            sortBy: {
              type: "string",
              enum: ["date", "name", "type", "size"],
              description: "Field to sort by",
              example: "date",
            },
            sortOrder: {
              type: "string",
              enum: ["asc", "desc"],
              description: "Sort order",
              example: "desc",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              description: "Maximum number of results",
              example: 20,
            },
            offset: {
              type: "integer",
              minimum: 0,
              description: "Number of results to skip",
              example: 0,
            },
          },
        },
        Error: {
          type: "object",
          required: ["error", "message"],
          properties: {
            error: {
              type: "string",
              description: "Error type",
              example: "ValidationError",
            },
            message: {
              type: "string",
              description: "Error message",
              example:
                "Invalid file type. Only videos, images, audio, and documents are allowed.",
            },
            details: {
              type: "object",
              description: "Additional error details",
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/controllers/*.js"], // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = {
  specs,
  swaggerUi,
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Noah API Documentation",
  }),
};
