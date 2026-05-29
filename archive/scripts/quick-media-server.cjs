const fastify = require("fastify")({ logger: true });
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// In-memory storage for media assets
let mediaAssets = [
  {
    id: "demo-video-1",
    name: "Sample Video.mp4",
    type: "video",
    url: "/uploads/sample-video.mp4",
    size: 15234567,
    duration: 120,
    createdAt: new Date().toISOString(),
  },
];

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads directory");
}

// CORS configuration
fastify.register(require("@fastify/cors"), {
  origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

// Register multipart plugin
fastify.register(require("@fastify/multipart"));

// Helper function to get file type from extension
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"].includes(ext))
    return "video";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext))
    return "audio";
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"].includes(ext))
    return "image";
  return "document";
}

// Get media assets
fastify.get("/api/media", async (request, reply) => {
  try {
    console.log("📋 Fetching media assets:", mediaAssets.length);
    return {
      success: true,
      assets: mediaAssets,
      count: mediaAssets.length,
    };
  } catch (error) {
    console.error("❌ Error fetching media:", error);
    reply.code(500).send({ success: false, error: error.message });
  }
});

// Upload media files
fastify.post("/api/media/upload", async (request, reply) => {
  try {
    console.log("📤 Starting file upload...");

    // Handle multipart form data
    const data = await request.file();

    if (!data) {
      console.log("❌ No file provided");
      return reply
        .code(400)
        .send({ success: false, error: "No file provided" });
    }

    console.log("📝 File details:", {
      filename: data.filename,
      mimetype: data.mimetype,
      encoding: data.encoding,
    });

    // Generate unique filename
    const fileExtension = path.extname(data.filename);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(uploadsDir, uniqueFilename);

    console.log("💾 Saving to:", filePath);

    // Save file to disk
    const buffer = await data.toBuffer();
    fs.writeFileSync(filePath, buffer);

    console.log("✅ File saved successfully");

    // Create media asset record
    const newAsset = {
      id: uuidv4(),
      name: data.filename,
      type: getFileType(data.filename),
      url: `/uploads/${uniqueFilename}`,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      filename: uniqueFilename,
    };

    // Add to in-memory storage
    mediaAssets.push(newAsset);

    console.log("📊 New asset created:", newAsset);
    console.log("📚 Total assets now:", mediaAssets.length);

    return {
      success: true,
      asset: newAsset,
      message: "File uploaded successfully",
    };
  } catch (error) {
    console.error("❌ Upload error:", error);
    reply.code(500).send({
      success: false,
      error: error.message,
      details: error.stack,
    });
  }
});

// Delete media asset
fastify.delete("/api/media/:id", async (request, reply) => {
  try {
    const { id } = request.params;
    const assetIndex = mediaAssets.findIndex((asset) => asset.id === id);

    if (assetIndex === -1) {
      return reply.code(404).send({ success: false, error: "Asset not found" });
    }

    const asset = mediaAssets[assetIndex];

    // Delete file from disk (if not sample)
    if (asset.filename && asset.filename !== "sample-video.mp4") {
      const filePath = path.join(uploadsDir, asset.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("🗑️ Deleted file:", filePath);
      }
    }

    // Remove from memory
    mediaAssets.splice(assetIndex, 1);

    console.log("✅ Asset deleted:", id);
    return { success: true, message: "Asset deleted successfully" };
  } catch (error) {
    console.error("❌ Delete error:", error);
    reply.code(500).send({ success: false, error: error.message });
  }
});

// Static file serving for uploads
fastify.get("/uploads/:filename", async (request, reply) => {
  try {
    const { filename } = request.params;
    const filePath = path.join(uploadsDir, filename);

    console.log("📦 Static file request for:", filename);
    console.log("📁 Looking at path:", filePath);

    if (!fs.existsSync(filePath)) {
      console.log("❌ File not found");
      return reply.code(404).send({ error: "File not found" });
    }

    console.log("✅ File found, serving...");
    const stat = fs.statSync(filePath);

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";

    if ([".mp4", ".avi", ".mov", ".webm"].includes(ext))
      contentType = "video/mp4";
    else if ([".mp3", ".wav", ".ogg"].includes(ext)) contentType = "audio/mpeg";
    else if ([".jpg", ".jpeg"].includes(ext)) contentType = "image/jpeg";
    else if ([".png"].includes(ext)) contentType = "image/png";
    else if ([".gif"].includes(ext)) contentType = "image/gif";
    else if ([".txt"].includes(ext)) contentType = "text/plain";

    const stream = fs.createReadStream(filePath);

    reply
      .code(200)
      .header("Content-Type", contentType)
      .header("Content-Length", stat.size)
      .header("Accept-Ranges", "bytes")
      .send(stream);
  } catch (error) {
    console.error("❌ Static file error:", error);
    reply.code(500).send({ error: error.message });
  }
});

// Health check
fastify.get("/api/health", async (request, reply) => {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uploadsDir: uploadsDir,
    assetsCount: mediaAssets.length,
  };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log("🚀 Quick Media Server running on http://localhost:3000");
    console.log("📁 Uploads directory:", uploadsDir);
    console.log("📊 Initial assets:", mediaAssets.length);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
