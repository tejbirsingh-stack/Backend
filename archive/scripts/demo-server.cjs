const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Function to determine file type by extension
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
  if (['.mp4', '.avi', '.mov', '.webm', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) return 'audio';
  return 'document';
}

// Function to scan uploads folder and create media assets
function scanUploadsFolder() {
  const uploadDir = path.join(__dirname, 'uploads');
  const assets = [];
  
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir);
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        const type = getFileType(file);
        const fileUrl = `http://localhost:${PORT}/uploads/${file}`;
        
        assets.push({
          id: `local-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
          name: file,
          type: type,
          size: stats.size,
          url: fileUrl,
          thumbnail: type === 'image' ? fileUrl : 
                    type === 'video' ? fileUrl : null,
          uploadDate: stats.mtime.toISOString(),
          tags: ['local', 'uploaded'],
          compressionStatus: 'completed'
        });
      }
    });
  }
  
  return assets;
}

// In-memory storage for demo - combine local files with sample videos
let mediaAssets = [
  // Add local files from uploads folder
  ...scanUploadsFolder(),
  // Keep one sample video for testing external URLs (simulating Backblaze)
  {
    id: 'demo-1',
    name: 'Sample External Video (BigBuckBunny)',
    type: 'video',
    size: 15728640,
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    uploadDate: new Date('2025-01-10').toISOString(),
    duration: 596,
    metadata: {
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'H.264',
      bitrate: '5000 kbps'
    },
    tags: ['sample', 'external', 'CDN'],
    compressionStatus: 'completed'
  }
];

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all media assets
app.get('/api/media', (req, res) => {
  res.json({
    success: true,
    assets: mediaAssets,
    count: mediaAssets.length
  });
});

// Get single media asset
app.get('/api/media/:id', (req, res) => {
  const asset = mediaAssets.find(a => a.id === req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.json({ success: true, asset });
});

// Upload media
app.post('/api/media/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const newAssets = req.files.map(file => {
    const id = uuidv4();
    const fileUrl = `http://localhost:${PORT}/uploads/${file.filename}`;
    const type = getFileType(file.originalname);

    const asset = {
      id,
      name: file.originalname,
      type,
      size: file.size,
      url: fileUrl,
      thumbnail: type === 'image' ? fileUrl : 
                type === 'video' ? fileUrl : null,
      uploadDate: new Date().toISOString(),
      tags: ['new', 'uploaded'],
      compressionStatus: 'pending'
    };

    mediaAssets.push(asset);
    return asset;
  });

  res.json({
    success: true,
    assets: newAssets,
    message: `Successfully uploaded ${newAssets.length} file(s)`
  });
});

// Delete media asset
app.delete('/api/media/:id', (req, res) => {
  const index = mediaAssets.findIndex(a => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  
  const deleted = mediaAssets.splice(index, 1)[0];
  res.json({ success: true, message: 'Asset deleted', asset: deleted });
});

// Update media asset
app.put('/api/media/:id', (req, res) => {
  const index = mediaAssets.findIndex(a => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  
  mediaAssets[index] = { ...mediaAssets[index], ...req.body };
  res.json({ success: true, asset: mediaAssets[index] });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mock authentication endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    res.json({
      success: true,
      token: 'demo-token-' + uuidv4(),
      user: {
        id: 'demo-user',
        email,
        name: 'Demo User',
        role: 'admin'
      }
    });
  } else {
    res.status(400).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (email && password) {
    res.json({
      success: true,
      token: 'demo-token-' + uuidv4(),
      user: {
        id: 'demo-user-' + uuidv4(),
        email,
        name: name || 'Demo User',
        role: 'user'
      }
    });
  } else {
    res.status(400).json({ error: 'Invalid registration data' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Demo server running on http://localhost:${PORT}`);
  console.log(`Web app should be accessed at http://localhost:3002`);
  console.log('\nMedia assets loaded:');
  
  const localAssets = mediaAssets.filter(a => a.tags && a.tags.includes('local'));
  const externalAssets = mediaAssets.filter(a => a.tags && a.tags.includes('external'));
  
  if (localAssets.length > 0) {
    console.log('\nLocal files from uploads folder:');
    localAssets.forEach(asset => {
      console.log(`  - ${asset.name} (${asset.type}) - ${(asset.size / 1024 / 1024).toFixed(2)} MB`);
    });
  }
  
  if (externalAssets.length > 0) {
    console.log('\nExternal CDN samples (simulating Backblaze):');
    externalAssets.forEach(asset => {
      console.log(`  - ${asset.name} (${asset.type})`);
    });
  }
  
  console.log(`\nTotal assets: ${mediaAssets.length}`);
});