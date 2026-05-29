const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Enable CORS for all origins (for development)
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    // Set proper headers for media files
    const ext = path.extname(filePath).toLowerCase();
    if (['.mp4', '.webm', '.ogg'].includes(ext)) {
      res.set('Content-Type', 'video/' + ext.substring(1));
    } else if (['.mp3', '.wav', '.m4a'].includes(ext)) {
      res.set('Content-Type', 'audio/' + ext.substring(1));
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      res.set('Content-Type', 'image/' + (ext === '.jpg' ? 'jpeg' : ext.substring(1)));
    }
    res.set('Accept-Ranges', 'bytes');
  }
}));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Helper function to get file type from extension
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) return 'image';
  if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext)) return 'document';
  return 'other';
}

// Helper function to get file metadata
async function getFileMetadata(filePath, filename) {
  try {
    const stats = fs.statSync(filePath);
    const type = getFileType(filename);
    
    return {
      id: uuidv4(),
      name: filename,
      type: type,
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      url: `/uploads/${filename}`,
      thumbnail: type === 'image' ? `/uploads/${filename}` : null
    };
  } catch (error) {
    console.error('Error getting file metadata:', error);
    return null;
  }
}

// Scan uploads folder and build media assets list
async function scanUploadsFolder() {
  const mediaAssets = [];
  
  try {
    const files = fs.readdirSync(uploadsDir);
    
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
    
    console.log(`📊 Found ${mediaAssets.length} media assets in uploads folder`);
    return mediaAssets;
  } catch (error) {
    console.error('Error scanning uploads folder:', error);
    return [];
  }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uploadsDir: uploadsDir,
    corsEnabled: true,
    version: '2.0.0'
  });
});

// Get all media assets (scans folder on each request)
app.get('/api/media', async (req, res) => {
  try {
    console.log('📋 GET /api/media - Scanning uploads folder...');
    const assets = await scanUploadsFolder();
    
    res.json({
      success: true,
      assets: assets,
      count: assets.length,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Returned ${assets.length} assets`);
  } catch (error) {
    console.error('❌ Error fetching media:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      assets: [],
      count: 0
    });
  }
});

// Upload media files
app.post('/api/media/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('📤 POST /api/media/upload - File upload started');
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file provided' 
      });
    }

    console.log('📝 File details:', {
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const metadata = await getFileMetadata(req.file.path, req.file.filename);
    
    res.json({
      success: true,
      asset: {
        ...metadata,
        originalName: req.file.originalname
      },
      message: 'File uploaded successfully'
    });
    
    console.log('✅ File uploaded successfully:', req.file.filename);
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete media asset
app.delete('/api/media/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }
    
    fs.unlinkSync(filePath);
    console.log('🗑️ Deleted file:', filename);
    
    res.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get single media asset
app.get('/api/media/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }
    
    const metadata = await getFileMetadata(filePath, filename);
    
    res.json({
      success: true,
      asset: metadata
    });
  } catch (error) {
    console.error('❌ Error fetching file:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Handle preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log('');
  console.log('🚀 Enhanced Media Server v2.0 Started!');
  console.log('======================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📁 Uploads: ${uploadsDir}`);
  console.log('🔌 CORS: Enabled for localhost:3001, 3002, 5173');
  console.log('');
  console.log('📍 Endpoints:');
  console.log(`  GET    http://localhost:${PORT}/api/health`);
  console.log(`  GET    http://localhost:${PORT}/api/media`);
  console.log(`  POST   http://localhost:${PORT}/api/media/upload`);
  console.log(`  DELETE http://localhost:${PORT}/api/media/:filename`);
  console.log(`  Static http://localhost:${PORT}/uploads/[filename]`);
  console.log('');
  
  // Initial scan
  const assets = await scanUploadsFolder();
  console.log(`📊 Initial scan: ${assets.length} media assets available`);
  
  if (assets.length > 0) {
    console.log('📸 Sample assets:');
    assets.slice(0, 3).forEach(asset => {
      console.log(`  - ${asset.name} (${asset.type})`);
    });
  }
  
  console.log('');
  console.log('✅ Server ready to handle requests!');
  console.log('======================================');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  process.exit(0);
});