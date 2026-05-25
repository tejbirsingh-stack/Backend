const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Express app
const app = express();

// Configuration
const config = {
  PORT: process.env.PORT || 3001,
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  UPLOAD_DIR: path.join(__dirname, 'apps', 'api', 'uploads'),
  ROOT_UPLOAD_DIR: path.join(__dirname, 'uploads'),
  APPS_UPLOAD_DIR: path.join(__dirname, 'apps', 'uploads'),
  THUMBNAIL_DIR: path.join(__dirname, 'apps', 'api', 'uploads', 'thumbnails'),
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
  ALLOWED_EXTENSIONS: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.mp3', '.wav'],
};

// Ensure upload directories exist
const ensureDirectories = async () => {
  const dirs = [config.UPLOAD_DIR, config.THUMBNAIL_DIR];
  for (const dir of dirs) {
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
};

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads - multiple paths
app.use('/uploads', express.static(config.UPLOAD_DIR));
app.use('/uploads', express.static(config.ROOT_UPLOAD_DIR));
app.use('/uploads', express.static(config.APPS_UPLOAD_DIR));
app.use('/media', express.static(config.UPLOAD_DIR));
app.use('/media', express.static(config.ROOT_UPLOAD_DIR));
app.use('/api/media/stream', express.static(config.UPLOAD_DIR));
app.use('/api/media/stream', express.static(config.ROOT_UPLOAD_DIR));
app.use('/api/media/file', express.static(config.UPLOAD_DIR));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDirectories();
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  },
});

// Simple in-memory database
const mediaDatabase = [];
const users = [
  {
    id: 'user-1',
    email: 'admin@noah.com',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin',
    orgId: 'org-1',
  },
  {
    id: 'user-2',
    email: 'test@noah.com',
    password: 'test123',
    name: 'Test User',
    role: 'user',
    orgId: 'org-1',
  },
];

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Allow unauthenticated access for testing
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      orgId: 'test-org-id',
      role: 'admin'
    };
    return next();
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Scan directories for media files
const scanMediaFiles = async () => {
  const mediaFiles = [];
  const scanDirs = [
    { path: config.UPLOAD_DIR, name: 'api-uploads' },
    { path: config.ROOT_UPLOAD_DIR, name: 'root-uploads' },
    { path: config.APPS_UPLOAD_DIR, name: 'apps-uploads' },
  ];
  
  for (const dir of scanDirs) {
    if (!fsSync.existsSync(dir.path)) continue;
    
    try {
      const files = await fs.readdir(dir.path);
      
      for (const file of files) {
        // Skip thumbnail directory
        if (file === 'thumbnails') continue;
        
        const filePath = path.join(dir.path, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if (config.ALLOWED_EXTENSIONS.includes(ext)) {
            // Determine media type
            let mediaType = 'document';
            if (['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'].includes(ext)) {
              mediaType = 'video';
            } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
              mediaType = 'image';
            } else if (['.mp3', '.wav'].includes(ext)) {
              mediaType = 'audio';
            }
            
            // Clean up the original name
            let originalName = file;
            // Remove UUID patterns
            originalName = originalName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '');
            // Remove timestamp patterns
            originalName = originalName.replace(/^\d{13}-/, '');
            originalName = originalName.replace(/^\d{10}-/, '');
            // Clean up remaining dashes and spaces
            originalName = originalName.replace(/^-+/, '').replace(/-+$/, '');
            if (!originalName || originalName === ext) {
              originalName = file;
            }
            
            mediaFiles.push({
              id: uuidv4(),
              fileName: file,
              originalName: originalName,
              filePath: path.relative(__dirname, filePath).replace(/\\/g, '/'),
              fileSize: stats.size,
              mimeType: getMimeType(ext),
              mediaType,
              uploadDate: stats.mtime,
              url: `/uploads/${file}`,
              streamUrl: `/api/media/stream/${file}`,
              downloadUrl: `/api/media/download/${file}`,
              thumbnail: mediaType === 'image' ? `/uploads/${file}` : null,
              directory: dir.name,
              fullPath: filePath,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir.path}:`, error);
    }
  }
  
  return mediaFiles;
};

// Get MIME type from extension
const getMimeType = (ext) => {
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'simple-media-server',
    timestamp: new Date().toISOString(),
    features: {
      upload: true,
      streaming: true,
      scanning: true,
      authentication: true,
    },
  });
});

// Scan media files
app.get('/api/media/scan', async (req, res) => {
  try {
    console.log('Scanning media directories...');
    const mediaFiles = await scanMediaFiles();
    
    console.log(`Found ${mediaFiles.length} media files`);
    
    res.json({
      success: true,
      message: `Found ${mediaFiles.length} media files`,
      files: mediaFiles,
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      error: 'Failed to scan media files',
      message: error.message,
    });
  }
});

// Get all media assets
app.get('/api/media', async (req, res) => {
  try {
    const { type, search, limit = 50, offset = 0 } = req.query;
    
    // Scan for files
    const scannedFiles = await scanMediaFiles();
    
    // Filter by type if specified
    let filteredFiles = scannedFiles;
    if (type && type !== 'all') {
      filteredFiles = scannedFiles.filter(f => f.mediaType === type);
    }
    
    // Search filter
    if (search) {
      filteredFiles = filteredFiles.filter(f => 
        f.originalName.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Sort by upload date (newest first)
    filteredFiles.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    
    // Apply pagination
    const start = parseInt(offset);
    const end = start + parseInt(limit);
    const paginatedFiles = filteredFiles.slice(start, end);
    
    res.json({
      success: true,
      data: paginatedFiles,
      meta: {
        total: filteredFiles.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: end < filteredFiles.length,
      },
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({
      error: 'Failed to fetch media assets',
      message: error.message,
    });
  }
});

// Get media asset by ID or filename
app.get('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Scan files
    const scannedFiles = await scanMediaFiles();
    const file = scannedFiles.find(f => f.id === id || f.fileName === id);
    
    if (file) {
      return res.json({
        success: true,
        data: file,
      });
    }
    
    res.status(404).json({
      error: 'Media asset not found',
    });
  } catch (error) {
    console.error('Error fetching media asset:', error);
    res.status(500).json({
      error: 'Failed to fetch media asset',
      message: error.message,
    });
  }
});

// Stream media file with range support
app.get('/api/media/stream/:filename', (req, res) => {
  const { filename } = req.params;
  const possiblePaths = [
    path.join(config.UPLOAD_DIR, filename),
    path.join(config.ROOT_UPLOAD_DIR, filename),
    path.join(config.APPS_UPLOAD_DIR, filename),
  ];
  
  let filePath = null;
  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      filePath = p;
      break;
    }
  }
  
  if (!filePath) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const stat = fsSync.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    // Support for video seeking
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fsSync.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': getMimeType(path.extname(filename)),
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': getMimeType(path.extname(filename)),
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fsSync.createReadStream(filePath).pipe(res);
  }
});

// Download media file
app.get('/api/media/download/:filename', (req, res) => {
  const { filename } = req.params;
  const possiblePaths = [
    path.join(config.UPLOAD_DIR, filename),
    path.join(config.ROOT_UPLOAD_DIR, filename),
    path.join(config.APPS_UPLOAD_DIR, filename),
  ];
  
  let filePath = null;
  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      filePath = p;
      break;
    }
  }
  
  if (!filePath) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath);
});

// Upload media files
app.post('/api/media/upload', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedFiles = [];
    
    for (const file of req.files) {
      uploadedFiles.push({
        id: uuidv4(),
        fileName: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        url: `/uploads/${file.filename}`,
        streamUrl: `/api/media/stream/${file.filename}`,
        downloadUrl: `/api/media/download/${file.filename}`,
      });
    }
    
    res.json({
      success: true,
      message: `Successfully uploaded ${uploadedFiles.length} files`,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message,
    });
  }
});

// Delete media asset
app.delete('/api/media/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    const possiblePaths = [
      path.join(config.UPLOAD_DIR, filename),
      path.join(config.ROOT_UPLOAD_DIR, filename),
      path.join(config.APPS_UPLOAD_DIR, filename),
    ];
    
    let deleted = false;
    for (const filePath of possiblePaths) {
      if (fsSync.existsSync(filePath)) {
        await fs.unlink(filePath);
        deleted = true;
        break;
      }
    }
    
    if (!deleted) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json({
      success: true,
      message: 'Media asset deleted successfully',
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      error: 'Failed to delete media asset',
      message: error.message,
    });
  }
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        orgId: user.orgId,
        role: user.role 
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message,
    });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// Initialize server
const startServer = async () => {
  try {
    // Ensure directories exist
    await ensureDirectories();
    
    // Start server
    app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║       Simple Media Server Running Successfully!         ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  🚀 Server: http://localhost:${config.PORT}                     ║
║                                                          ║
║  📁 API Endpoints:                                       ║
║     • GET    /api/media         - List all media        ║
║     • GET    /api/media/scan    - Scan directories      ║
║     • GET    /api/media/:id     - Get single media      ║
║     • POST   /api/media/upload  - Upload files          ║
║     • DELETE /api/media/:id     - Delete media          ║
║     • GET    /api/media/stream/:filename - Stream       ║
║     • GET    /api/media/download/:filename - Download   ║
║                                                          ║
║  🔐 Authentication:                                      ║
║     • POST   /api/auth/login    - Login                 ║
║     • GET    /api/auth/me       - Current user          ║
║                                                          ║
║  📊 Test Credentials:                                    ║
║     Email: admin@noah.com                               ║
║     Password: admin123                                   ║
║                                                          ║
║  💡 Quick Test:                                          ║
║     curl http://localhost:${config.PORT}/api/media/scan         ║
║                                                          ║
║  📺 Video Streaming:                                     ║
║     Videos support range requests for seeking           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
      `);
      
      // Auto-scan on startup
      scanMediaFiles().then(files => {
        console.log(`\n✅ Auto-scan complete: Found ${files.length} media files`);
        if (files.length > 0) {
          console.log('\n📋 Sample files:');
          files.slice(0, 5).forEach(f => {
            console.log(`   • ${f.originalName} (${f.mediaType}) - ${(f.fileSize / 1024 / 1024).toFixed(2)} MB`);
          });
        }
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📤 Shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();