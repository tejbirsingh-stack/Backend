const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (for development)
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads directory");
} else {
  console.log("📁 Using existing uploads directory:", uploadsDir);
}

// Configure multer for file uploads - FIXED VERSION
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Keep original extension
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

// Create multer instance with storage config
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 500 * 1024 * 1024 // 500MB limit
  }
});

// Serve static files from uploads directory
app.use("/uploads", express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    
    // Set proper content types
    if (['.mp4', '.webm', '.ogg'].includes(ext)) {
      res.setHeader('Content-Type', `video/${ext.slice(1)}`);
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      res.setHeader('Content-Type', `image/${ext.slice(1) === '.jpg' ? 'jpeg' : ext.slice(1)}`);
    }
    
    // Enable CORS for media files
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// Helper function to get file type
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext)) return "audio";
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp"].includes(ext)) return "image";
  if ([".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx"].includes(ext)) return "document";
  return "other";
}

// Helper function to get file metadata
async function getFileMetadata(filePath, filename) {
  try {
    const stat = fs.statSync(filePath);
    const type = getFileType(filename);
    
    return {
      id: filename,
      name: filename,
      type: type,
      size: stat.size,
      uploadDate: stat.birthtime.toISOString(),
      url: `/uploads/${filename}`,
      duration: type === "video" ? Math.floor(Math.random() * 300) : null,
      thumbnail: type === "image" ? `/uploads/${filename}` : null,
      tags: [],
      metadata: {
        width: type === "image" || type === "video" ? 1920 : null,
        height: type === "image" || type === "video" ? 1080 : null,
      }
    };
  } catch (error) {
    console.error("Error getting file metadata:", error);
    return null;
  }
}

// Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uploadsDir: uploadsDir,
    version: "2.0.1-fixed"
  });
});

// Get all media assets
app.get("/api/media", async (req, res) => {
  try {
    console.log("📋 Fetching media list...");
    const files = fs.readdirSync(uploadsDir);
    const mediaAssets = [];
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        const metadata = await getFileMetadata(filePath, file);
        if (metadata) {
          mediaAssets.push(metadata);
        }
      }
    }
    
    res.json({
      success: true,
      assets: mediaAssets,
      count: mediaAssets.length
    });
    
    console.log(`✅ Returned ${mediaAssets.length} assets`);
  } catch (error) {
    console.error("❌ Error fetching media:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload media file - FIXED ENDPOINT
app.post("/api/media/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("📤 Upload request received");
    
    if (!req.file) {
      console.log("❌ No file in request");
      return res.status(400).json({
        success: false,
        error: "No file provided"
      });
    }
    
    console.log("📝 File uploaded:", {
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });
    
    // Get metadata for the uploaded file
    const metadata = await getFileMetadata(req.file.path, req.file.filename);
    
    res.json({
      success: true,
      asset: {
        ...metadata,
        originalName: req.file.originalname
      },
      message: "File uploaded successfully"
    });
    
    console.log("✅ Upload successful:", req.file.filename);
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete media file
app.delete("/api/media/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "File not found"
      });
    }
    
    fs.unlinkSync(filePath);
    console.log("🗑️ Deleted file:", filename);
    
    res.json({
      success: true,
      message: "File deleted successfully"
    });
  } catch (error) {
    console.error("❌ Delete error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  
  // Handle multer errors specifically
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 500MB.'
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`
    });
  }
  
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error"
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Fixed Media Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${uploadsDir}`);
  console.log(`📡 API endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/media - List all media`);
  console.log(`   POST /api/media/upload - Upload file`);
  console.log(`   DELETE /api/media/:filename - Delete file`);
  console.log(`   GET  /uploads/:filename - Direct file access`);
});