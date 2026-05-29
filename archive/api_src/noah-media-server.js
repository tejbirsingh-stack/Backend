const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
const { createCanvas, loadImage } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Utility functions for thumbnail generation
async function generateVideoThumbnail(
  videoPath,
  outputPath,
  timestamp = "00:00:01"
) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "320x240",
      })
      .on("end", () => {
        console.log(`✅ Video thumbnail generated: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error("❌ Video thumbnail generation failed:", err);
        reject(err);
      });
  });
}

async function generateImageThumbnail(imagePath, outputPath) {
  try {
    await sharp(imagePath)
      .resize(320, 240, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    console.log(`✅ Image thumbnail generated: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("❌ Image thumbnail generation failed:", error);
    throw error;
  }
}

async function generateDocumentThumbnail(documentPath, outputPath) {
  try {
    // Create a simple document icon thumbnail
    const canvas = createCanvas(320, 240);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, 320, 240);

    // Document icon
    ctx.fillStyle = "#6c757d";
    ctx.fillRect(60, 40, 200, 160);

    // Folded corner
    ctx.fillStyle = "#495057";
    ctx.beginPath();
    ctx.moveTo(230, 40);
    ctx.lineTo(260, 40);
    ctx.lineTo(260, 70);
    ctx.closePath();
    ctx.fill();

    // Text lines
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(80, 80, 160, 8);
    ctx.fillRect(80, 100, 140, 8);
    ctx.fillRect(80, 120, 120, 8);
    ctx.fillRect(80, 140, 100, 8);

    // Extension text
    const ext = path.extname(documentPath).toUpperCase().substring(1);
    ctx.fillStyle = "#495057";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(ext, 160, 180);

    const buffer = canvas.toBuffer("image/jpeg");
    await fs.writeFile(outputPath, buffer);

    console.log(`✅ Document thumbnail generated: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("❌ Document thumbnail generation failed:", error);
    throw error;
  }
}

async function ensureThumbnail(asset) {
  const uploadsDir = path.join(__dirname, "../uploads");
  const thumbnailsDir = path.join(uploadsDir, "thumbnails");

  // Create thumbnails directory if it doesn't exist
  try {
    await fs.mkdir(thumbnailsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  const thumbnailPath = path.join(thumbnailsDir, `${asset.id}_thumb.jpg`);
  const thumbnailUrl = `http://localhost:3000/uploads/thumbnails/${asset.id}_thumb.jpg`;

  // Check if thumbnail already exists
  try {
    await fs.access(thumbnailPath);
    return thumbnailUrl;
  } catch (error) {
    // Thumbnail doesn't exist, generate it
  }

  try {
    if (asset.type.startsWith("video/")) {
      // For demo purposes, we'll create a placeholder since we don't have actual video files
      await generateDocumentThumbnail(asset.url, thumbnailPath);
    } else if (asset.type.startsWith("image/")) {
      // For demo purposes, we'll create a placeholder since we don't have actual image files
      await generateDocumentThumbnail(asset.url, thumbnailPath);
    } else {
      // Document or other file type
      await generateDocumentThumbnail(asset.url, thumbnailPath);
    }

    return thumbnailUrl;
  } catch (error) {
    console.error(`Failed to generate thumbnail for ${asset.id}:`, error);
    return null;
  }
}

// Test media data
const testMediaAssets = [
  {
    id: "demo-video-1",
    name: "Sample Video.mp4",
    type: "video/mp4",
    mimetype: "video/mp4",
    size: 15728640, // 15MB in bytes
    uploadDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    url: "http://localhost:3000/uploads/demo-video.mp4",
    thumbnail: "http://localhost:3000/uploads/demo-video-thumb.jpg",
    duration: 165, // 2:45 in seconds
    dimensions: { width: 1920, height: 1080 },
    tags: ["demo", "sample"],
    uploadedBy: "Demo User",
  },
  {
    id: "demo-image-1",
    name: "Sample Image.jpg",
    type: "image/jpeg",
    mimetype: "image/jpeg",
    size: 2097152, // 2MB in bytes
    uploadDate: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    url: "http://localhost:3000/uploads/demo-image.jpg",
    thumbnail: "http://localhost:3000/uploads/demo-image.jpg",
    dimensions: { width: 1920, height: 1080 },
    tags: ["demo", "sample", "image"],
    uploadedBy: "Demo User",
  },
  {
    id: "demo-audio-1",
    name: "Sample Audio.mp3",
    type: "audio/mpeg",
    mimetype: "audio/mpeg",
    size: 5242880, // 5MB in bytes
    uploadDate: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    url: "http://localhost:3000/uploads/demo-audio.mp3",
    duration: 180, // 3:00 in seconds
    tags: ["demo", "sample", "audio"],
    uploadedBy: "Demo User",
  },
  {
    id: "demo-doc-1",
    name: "Sample Document.pdf",
    type: "application/pdf",
    mimetype: "application/pdf",
    size: 1048576, // 1MB in bytes
    uploadDate: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    url: "http://localhost:3000/uploads/demo-document.pdf",
    tags: ["demo", "sample", "document"],
    uploadedBy: "Demo User",
  },
];

// API Routes
app.get("/api/media", async (req, res) => {
  console.log("📁 GET /api/media - Fetching media assets");

  try {
    // Generate thumbnails for all assets
    const assetsWithThumbnails = await Promise.all(
      testMediaAssets.map(async (asset) => {
        const thumbnailUrl = await ensureThumbnail(asset);
        return {
          ...asset,
          thumbnail: thumbnailUrl || asset.thumbnail,
        };
      })
    );

    res.json({
      success: true,
      data: assetsWithThumbnails,
      total: assetsWithThumbnails.length,
    });
  } catch (error) {
    console.error("Error fetching media:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch media assets",
      error: error.message,
    });
  }
});

app.get("/api/media/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📁 GET /api/media/${id} - Fetching specific asset`);

  const asset = testMediaAssets.find((a) => a.id === id);

  if (!asset) {
    return res.status(404).json({
      success: false,
      message: "Asset not found",
    });
  }

  try {
    // Generate thumbnail if needed
    const thumbnailUrl = await ensureThumbnail(asset);
    const assetWithThumbnail = {
      ...asset,
      thumbnail: thumbnailUrl || asset.thumbnail,
    };

    res.json({
      success: true,
      data: assetWithThumbnail,
    });
  } catch (error) {
    console.error("Error fetching asset:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch asset",
      error: error.message,
    });
  }
});

// Upload endpoint with automatic thumbnail generation
app.post("/api/media/upload", async (req, res) => {
  console.log("📤 POST /api/media/upload - File upload request");

  try {
    // For demo purposes, simulate file upload
    const newAsset = {
      id: uuidv4(),
      name: "Uploaded File.mp4",
      type: "video/mp4",
      mimetype: "video/mp4",
      size: Math.floor(Math.random() * 50000000), // Random size
      uploadDate: new Date().toISOString(),
      url: "http://localhost:3000/uploads/uploaded-file.mp4",
      duration: Math.floor(Math.random() * 300), // Random duration
      dimensions: { width: 1920, height: 1080 },
      tags: ["uploaded"],
      uploadedBy: "Current User",
    };

    // Generate thumbnail
    const thumbnailUrl = await ensureThumbnail(newAsset);
    newAsset.thumbnail = thumbnailUrl;

    // Add to test data
    testMediaAssets.unshift(newAsset);

    res.json({
      success: true,
      message: "File uploaded successfully",
      data: newAsset,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message,
    });
  }
});

// Thumbnail generation endpoint
app.post("/api/media/:id/thumbnail", async (req, res) => {
  const { id } = req.params;
  console.log(`🖼️ POST /api/media/${id}/thumbnail - Generate thumbnail`);

  const asset = testMediaAssets.find((a) => a.id === id);

  if (!asset) {
    return res.status(404).json({
      success: false,
      message: "Asset not found",
    });
  }

  try {
    const thumbnailUrl = await ensureThumbnail(asset);

    res.json({
      success: true,
      message: "Thumbnail generated successfully",
      thumbnail: thumbnailUrl,
    });
  } catch (error) {
    console.error("Thumbnail generation error:", error);
    res.status(500).json({
      success: false,
      message: "Thumbnail generation failed",
      error: error.message,
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Media API Server is running",
    timestamp: new Date().toISOString(),
    assets: testMediaAssets.length,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("API Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Noah Media API Server running on http://localhost:${PORT}`);
  console.log(`📁 API endpoints:`);
  console.log(`   GET /api/media - List all media assets`);
  console.log(`   GET /api/media/:id - Get specific asset`);
  console.log(`   GET /api/health - Health check`);
  console.log(`📊 Test assets loaded: ${testMediaAssets.length}`);
});

module.exports = app;
