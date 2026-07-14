const {
  PrismaClient,
} = require("../../../../packages/@noah/db/node_modules/@prisma/client");

class MediaAssetService {
  constructor() {
    this.prisma = globalThis.prisma || new PrismaClient();
  }

  // Get all media assets with filtering and sorting
  async getMediaAssets(filters = {}) {
    const {
      query,
      type,
      sortBy = "createdAt",
      sortOrder = "desc",
      orgId,
    } = filters;

    // Build where clause
    const where = {
      deletedAt: null, // Only get non-deleted assets
      ...(orgId && { orgId }),
    };

    // Add search filter
    if (query) {
      where.OR = [
        { fileName: { contains: query, mode: "insensitive" } },
        { metadata: { path: ["tags"], array_contains: [query] } },
      ];
    }

    // Add type filter
    if (type && type !== "All") {
      const mimeTypeFilters = {
        Video: { mimeType: { startsWith: "video/" } },
        Images: { mimeType: { startsWith: "image/" } },
        Audio: { mimeType: { startsWith: "audio/" } },
        Document: {
          OR: [
            { mimeType: { contains: "pdf" } },
            { mimeType: { contains: "document" } },
            { mimeType: { contains: "word" } },
            { mimeType: { contains: "text" } },
          ],
        },
      };

      if (mimeTypeFilters[type]) {
        Object.assign(where, mimeTypeFilters[type]);
      }
    }

    // Build orderBy clause with field mapping
    const sortFieldMap = {
      date: "createdAt",
      name: "fileName",
      size: "fileSize",
      type: "mimeType",
    };

    const dbSortField = sortFieldMap[sortBy] || sortBy;
    const orderBy = {};
    orderBy[dbSortField] = sortOrder;

    try {
      const assets = await this.prisma.mediaAsset.findMany({
        where,
        orderBy,
        include: {
          uploadedBy: {
            select: { name: true, email: true },
          },
        },
      });

      // Transform to match frontend format
      return assets.map(this.transformAssetForFrontend);
    } catch (error) {
      console.error("Error fetching media assets:", error);
      throw error;
    }
  }

  // Create a new media asset
  async createMediaAsset(assetData) {
    const {
      fileName,
      filePath,
      fileSize,
      mimeType,
      orgId,
      uploadedByUserId,
      metadata = {},
      tags = [],
    } = assetData;

    try {
      const asset = await this.prisma.mediaAsset.create({
        data: {
          fileName,
          filePath,
          fileSize: BigInt(fileSize),
          originalSize: BigInt(fileSize),
          mimeType,
          fileExtension: this.getFileExtension(fileName),
          orgId,
          uploadedByUserId,
          status: "ready",
          metadata: {
            tags,
            ...metadata,
          },
        },
        include: {
          uploadedBy: {
            select: { name: true, email: true },
          },
        },
      });

      return this.transformAssetForFrontend(asset);
    } catch (error) {
      console.error("Error creating media asset:", error);
      throw error;
    }
  }

  // Get a specific media asset
  async getMediaAsset(id, orgId) {
    try {
      const asset = await this.prisma.mediaAsset.findFirst({
        where: {
          id,
          orgId,
          deletedAt: null,
        },
        include: {
          uploadedBy: {
            select: { name: true, email: true },
          },
        },
      });

      if (!asset) {
        return null;
      }

      return this.transformAssetForFrontend(asset);
    } catch (error) {
      console.error("Error fetching media asset:", error);
      throw error;
    }
  }

  // Update a media asset
  async updateMediaAsset(id, orgId, updateData) {
    try {
      const asset = await this.prisma.mediaAsset.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: {
          uploadedBy: {
            select: { name: true, email: true },
          },
        },
      });

      return this.transformAssetForFrontend(asset);
    } catch (error) {
      console.error("Error updating media asset:", error);
      throw error;
    }
  }

  // Soft delete a media asset
  async deleteMediaAsset(id, orgId) {
    try {
      await this.prisma.mediaAsset.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      return { success: true };
    } catch (error) {
      console.error("Error deleting media asset:", error);
      throw error;
    }
  }

  // Utility methods
  getFileExtension(fileName) {
    const parts = fileName.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : null;
  }

  // Transform database asset to frontend format
  transformAssetForFrontend(asset) {
    const tags = asset.metadata?.tags || [];
    const fileSize = Number(asset.fileSize);

    // Generate file URL for serving
    const fileName = require("path").basename(asset.filePath);
    const fileUrl = `http://localhost:3000/uploads/${fileName}`;

    return {
      id: asset.id,
      name: asset.fileName,
      type: MediaAssetService.getMediaType(asset.mimeType),
      size: MediaAssetService.formatFileSize(fileSize),
      date: MediaAssetService.formatTimeAgo(asset.createdAt),
      tags,
      filename: asset.fileName,
      mimetype: asset.mimeType,
      resolution:
        asset.width && asset.height
          ? `${asset.width}x${asset.height}`
          : "Unknown",
      duration: asset.durationSeconds
        ? MediaAssetService.formatDuration(asset.durationSeconds)
        : "Unknown",
      uploadedBy: asset.uploadedBy?.name || "Unknown",
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      path: asset.filePath,
      url: fileUrl, // Add file URL for media serving
    };
  }

  // Static utility methods
  static getMediaType(mimeType) {
    if (mimeType.startsWith("image/")) return "Images";
    if (mimeType.startsWith("video/")) return "Video";
    if (mimeType.startsWith("audio/")) return "Audio";
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("document") ||
      mimeType.includes("word") ||
      mimeType.includes("text")
    )
      return "Document";
    return "Other";
  }

  static formatFileSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }

  static formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 30)
      return `${Math.floor(diffDays / 30)} month${
        Math.floor(diffDays / 30) > 1 ? "s" : ""
      } ago`;
    if (diffDays > 7)
      return `${Math.floor(diffDays / 7)} week${
        Math.floor(diffDays / 7) > 1 ? "s" : ""
      } ago`;
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    if (diffHours > 0)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffMinutes > 0)
      return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
    return "Just now";
  }

  static formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  }

  // Disconnect Prisma client
  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = MediaAssetService;
