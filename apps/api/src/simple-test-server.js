const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");

const PORT = 3000;

// Define uploads directories to scan
const UPLOADS_DIRS = [
  path.join(__dirname, "../../../uploads"),
  path.join(__dirname, "../../uploads"),
  path.join(__dirname, "../uploads"),
  path.join(__dirname, "uploads"),
];

// Find the uploads directory that exists
function findUploadsDir() {
  for (const dir of UPLOADS_DIRS) {
    if (fs.existsSync(dir)) {
      console.log(`📁 Found uploads directory: ${dir}`);
      return dir;
    }
  }
  console.warn(
    `⚠️ No uploads directory found. Checked: ${UPLOADS_DIRS.join(", ")}`
  );
  return null;
}

// Get file MIME type based on extension
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".mp4": "video/mp4",
    ".avi": "video/avi",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// Scan uploads directory and create media assets
function scanMediaAssets() {
  const uploadsDir = findUploadsDir();
  if (!uploadsDir) {
    return [];
  }

  const assets = [];

  try {
    const files = fs.readdirSync(uploadsDir);
    console.log(`📂 Found ${files.length} files in uploads directory`);

    files.forEach((filename, index) => {
      const filePath = path.join(uploadsDir, filename);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        const mimeType = getMimeType(filePath);
        const fileSize = stats.size;
        const uploadDate = stats.mtime.toISOString();

        const asset = {
          id: `upload-${index + 1}`,
          name: filename,
          type: mimeType,
          mimetype: mimeType,
          size: fileSize,
          uploadDate: uploadDate,
          url: `http://localhost:${PORT}/uploads/${filename}`,
          tags: [mimeType.split("/")[0]],
          uploadedBy: "User",
        };

        // Add specific properties based on file type
        if (mimeType.startsWith("video/")) {
          asset.duration = 120; // Default duration - would need ffprobe for real duration
          asset.dimensions = { width: 1920, height: 1080 }; // Default - would need ffprobe
          asset.thumbnail = `http://localhost:${PORT}/uploads/${filename}`; // Could generate thumbnails
        } else if (mimeType.startsWith("image/")) {
          asset.dimensions = { width: 1920, height: 1080 }; // Default - would need image analysis
          asset.thumbnail = asset.url; // Image serves as its own thumbnail
        } else if (mimeType.startsWith("audio/")) {
          asset.duration = 180; // Default duration - would need audio analysis
        }

        assets.push(asset);
        console.log(
          `📄 Added asset: ${filename} (${mimeType}, ${fileSize} bytes)`
        );
      }
    });
  } catch (error) {
    console.error(`❌ Error scanning uploads directory: ${error.message}`);
  }

  return assets;
}

// Load media assets from uploads folder - will be rescanned on each request
console.log("🎬 Noah Media API Server starting...");

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${req.method} ${pathname}`);

  // GET /api/media - List all media assets
  if (req.method === "GET" && pathname === "/api/media") {
    console.log("📁 Fetching media assets");

    // Rescan the uploads directory for fresh assets
    const mediaAssets = scanMediaAssets();

    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        data: mediaAssets,
        total: mediaAssets.length,
      })
    );
    return;
  }

  // GET /api/media/:id - Get specific asset
  if (req.method === "GET" && pathname.startsWith("/api/media/")) {
    const id = pathname.split("/").pop();
    console.log(`📁 Fetching asset: ${id}`);

    // Rescan the uploads directory for fresh assets
    const mediaAssets = scanMediaAssets();
    const asset = mediaAssets.find((a) => a.id === id);

    if (!asset) {
      res.writeHead(404);
      res.end(
        JSON.stringify({
          success: false,
          message: "Asset not found",
        })
      );
      return;
    }

    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        data: asset,
      })
    );
    return;
  }

  // GET /api/health - Health check
  if (req.method === "GET" && pathname === "/api/health") {
    // Get current asset count
    const currentAssets = scanMediaAssets();

    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        message: "Media API Server is running",
        timestamp: new Date().toISOString(),
        assets: currentAssets.length,
      })
    );
    return;
  }

  // Serve uploaded files - GET /uploads/*
  if (req.method === "GET" && pathname.startsWith("/uploads/")) {
    const filename = pathname.split("/").pop();
    const uploadsDir = findUploadsDir();

    if (!uploadsDir) {
      res.writeHead(404);
      res.end("Uploads directory not found");
      return;
    }

    const filePath = path.join(uploadsDir, filename);

    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const mimeType = getMimeType(filePath);

        res.writeHead(200, {
          "Content-Type": mimeType,
          "Content-Length": stats.size,
          "Cache-Control": "public, max-age=3600",
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
        return;
      } else {
        res.writeHead(404);
        res.end("File not found");
        return;
      }
    } catch (error) {
      res.writeHead(500);
      res.end(`Error serving file: ${error.message}`);
      return;
    }
  }

  // 404 - Not found
  res.writeHead(404);
  res.end(
    JSON.stringify({
      success: false,
      message: "Endpoint not found",
    })
  );
});

server.listen(PORT, () => {
  console.log(`🎬 Noah Media API Server running on http://localhost:${PORT}`);
  console.log(`📁 API endpoints:`);
  console.log(`   GET /api/media - List all media assets`);
  console.log(`   GET /api/media/:id - Get specific asset`);
  console.log(`   GET /api/health - Health check`);

  // Show initial asset count
  const initialAssets = scanMediaAssets();
  console.log(`📊 Real media assets loaded: ${initialAssets.length}`);
});
