const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const B2StorageService = require("./b2-storage.cjs");
const B2SyncService = require("./b2-sync-service.cjs");

const app = express();
const PORT = process.env.PORT || 3000;

// Try to initialize real Auth Service with graceful fallback
// Use Simple Auth for guaranteed authentication
const SimpleAuth = require("./simple-auth.cjs");
const authService = new SimpleAuth();
console.log("✅ Simple Auth Service loaded - No database required!");
console.log("📝 Valid users:");
console.log("   - admin@visitdetroit.com / admin123");
console.log("   - test@example.com / test123");
console.log("   - demo@demo.com / demo");

// Add wrapper methods for compatibility with existing code
authService.refreshToken = async (refreshToken) => {
  // Simple auth doesn't really need refresh, just return same token
  return {
    success: true,
    accessToken: refreshToken,
    refreshToken: refreshToken
  };
};

authService.getCurrentUser = async (token) => {
  const user = authService.verifyToken(token);
  if (!user) {
    return { success: false, error: 'Invalid or expired token' };
  }
  return { success: true, user };
};

authService.ensureAdminUser = async () => {
  // Simple auth has hardcoded users, always succeeds
  return { success: true };
};

// Initialize B2 Storage Service
const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION
});

// Initialize B2 Sync Service
const b2SyncService = new B2SyncService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  uploadsDir: path.resolve(__dirname, "../../../uploads"),
  syncInterval: 300000, // 5 minutes
  autoSync: process.env.B2_AUTO_SYNC !== 'false' // Enable by default if B2 is configured
});

// CORS configuration for both development and production
const isDevelopment = process.env.NODE_ENV !== 'production';

console.log(`🔧 Environment: NODE_ENV=${process.env.NODE_ENV}, isDevelopment=${isDevelopment}`);

// Generate CORS origins
let corsOrigins = [];

if (isDevelopment) {
  // Development: Allow localhost ports
  for (let port = 3001; port <= 3010; port++) {
    corsOrigins.push(`http://localhost:${port}`);
    corsOrigins.push(`http://127.0.0.1:${port}`);
  }
  corsOrigins.push("http://localhost:5173");
  console.log(`🔧 Development CORS origins: ${corsOrigins.join(', ')}`);
} else {
  // Production: Allow specific domains
  const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
  corsOrigins = [
    'https://spectacular-amazement-production.up.railway.app',
    'https://noah-8bhk96qx4-webs-projects-a64245b0.vercel.app',
    'https://noah-git-master-webs-projects-a64245b0.vercel.app',
    'https://noah-webs-projects-a64245b0.vercel.app',
    'https://noah-web-nine.vercel.app',
    ...allowedOrigins
  ];
  console.log(`🔧 Production CORS origins: ${corsOrigins.join(', ')}`);
}

// Enable CORS
console.log(`🔧 Setting up CORS with origins: ${corsOrigins.join(', ')}`);
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "X-Requested-With"],
    exposedHeaders: ["Content-Length", "Content-Type"],
  })
);

app.use(express.json());

// Serve static files from uploads directory
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "..", "..", "uploads"), {
    setHeaders: (res, filePath) => {
      // Set proper headers for media files
      const ext = path.extname(filePath).toLowerCase();
      if ([".mp4", ".webm", ".ogg"].includes(ext)) {
        res.set("Content-Type", "video/" + ext.substring(1));
      } else if ([".mp3", ".wav", ".m4a"].includes(ext)) {
        res.set("Content-Type", "audio/" + ext.substring(1));
      } else if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
        res.set(
          "Content-Type",
          "image/" + (ext === ".jpg" ? "jpeg" : ext.substring(1))
        );
      }
      res.set("Accept-Ranges", "bytes");
    },
  })
);

// Create uploads directory if it doesn't exist
// Use the root noah/uploads directory
const uploadsDir = path.join(__dirname, "..", "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads directory");
} else {
  console.log("📁 Using existing uploads directory");
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

// Helper function to get file type from extension
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"].includes(ext))
    return "video";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext))
    return "audio";
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"].includes(ext))
    return "image";
  if ([".pdf", ".doc", ".docx", ".txt", ".md"].includes(ext)) return "document";
  return "other";
}

// Helper function to get file metadata
async function getFileMetadata(filePath, filename, useRelativeUrls = false) {
  try {
    const stats = fs.statSync(filePath);
    const type = getFileType(filename);

    // Use relative URLs for proxy requests, absolute for direct access
    const railwayUrl = process.env.RAILWAY_STATIC_URL || 
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RAILWAY_URL;
    const baseUrl = railwayUrl ? `https://${railwayUrl}` : `http://localhost:${PORT}`;
    const urlPrefix = useRelativeUrls ? "" : baseUrl;

    return {
      id: uuidv4(),
      name: filename,
      type: type,
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      uploadDate: stats.birthtime,
      url: `${urlPrefix}/uploads/${filename}`,
      thumbnail: type === "image" ? `${urlPrefix}/uploads/${filename}` : null,
      tags: [],
      metadata: {},
      compressionStatus: "completed",
    };
  } catch (error) {
    console.error("Error getting file metadata:", error);
    return null;
  }
}

// Recursively scan folder for all subfolders and files
async function scanFolderRecursive(folderPath, relativePath = '', useRelativeUrls = false) {
  const items = { assets: [], folders: [] };
  
  // List of files to ignore
  const ignoredFiles = ['nul', 'NUL', '.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep'];
  const ignoredExtensions = ['.iconikagent', '.tmp', '.temp', '.cache'];
  
  try {
    const files = fs.readdirSync(folderPath);
    
    for (const file of files) {
      // Skip ignored files
      if (ignoredFiles.includes(file) || file.startsWith('.')) {
        continue;
      }
      
      // Skip files with ignored extensions
      const hasIgnoredExtension = ignoredExtensions.some(ext => file.toLowerCase().endsWith(ext));
      if (hasIgnoredExtension) {
        continue;
      }
      
      const filePath = path.join(folderPath, file);
      
      // Try to stat the file, skip if it fails
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (error) {
        console.warn(`Skipping problematic file: ${file}`);
        continue;
      }
      
      const fullRelativePath = relativePath ? `${relativePath}/${file}` : file;
      
      if (stat.isFile()) {
        const metadata = await getFileMetadata(filePath, file, useRelativeUrls);
        if (metadata) {
          metadata.folder = relativePath || null;
          const railwayUrl = process.env.RAILWAY_STATIC_URL || 
            process.env.RAILWAY_PUBLIC_DOMAIN ||
            process.env.RAILWAY_URL;
          const baseUrl = railwayUrl ? `https://${railwayUrl}` : `http://localhost:${PORT}`;
          metadata.url = `${useRelativeUrls ? "" : baseUrl}/uploads/${fullRelativePath}`;
          items.assets.push(metadata);
        }
      } else if (stat.isDirectory()) {
        // Add this folder
        const subItems = fs.readdirSync(filePath);
        const fileCount = subItems.filter(f => {
          const subPath = path.join(filePath, f);
          return fs.statSync(subPath).isFile();
        }).length;
        const folderCount = subItems.filter(f => {
          const subPath = path.join(filePath, f);
          return fs.statSync(subPath).isDirectory();
        }).length;
        
        items.folders.push({
          id: uuidv4(),
          name: file,
          type: 'folder',
          path: fullRelativePath,
          parent: relativePath || null,
          createdAt: stat.birthtime,
          modifiedAt: stat.mtime,
          fileCount: fileCount,
          folderCount: folderCount
        });
        
        // Recursively scan subdirectory
        const subResults = await scanFolderRecursive(filePath, fullRelativePath, useRelativeUrls);
        items.assets.push(...subResults.assets);
        items.folders.push(...subResults.folders);
      }
    }
  } catch (error) {
    console.error(`Error scanning folder ${folderPath}:`, error);
  }
  
  return items;
}

// Scan uploads folder and build media assets list including folders
async function scanUploadsFolder(useRelativeUrls = false) {
  try {
    const result = await scanFolderRecursive(uploadsDir, '', useRelativeUrls);
    
    console.log(
      `📊 Found ${result.assets.length} media assets and ${result.folders.length} folders in uploads`
    );
    return result;
  } catch (error) {
    console.error("Error scanning uploads folder:", error);
    return [];
  }
}

// Routes

// ============== TEST ROUTE ==============
app.get("/api/test", (req, res) => {
  res.json({ message: "Test route working", timestamp: new Date().toISOString() });
});

// Single test route right after working one
app.get("/api/test2", (req, res) => {
  res.json({ message: "Test2 route working" });
});

// Test with different auth-related paths to isolate the issue
app.get("/api/authentication/test", (req, res) => {
  res.json({ message: "Authentication test route working" });
});

app.get("/api/users/test", (req, res) => {
  res.json({ message: "Users test route working" });
});

app.get("/api/auth-test", (req, res) => {
  res.json({ message: "Auth-test route working" });
});

// ============== AUTH ROUTES ==============
// Simple auth test route
app.get("/api/auth/test", (req, res) => {
  res.json({ message: "Auth test route working" });
});

// Real database-backed authentication
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  console.log('🔐 =================================');
  console.log('🔐 Login attempt:', {
    email,
    timestamp: new Date().toISOString(),
    authServiceType: authService.constructor ? authService.constructor.name : 'unknown',
    passwordLength: password ? password.length : 0
  });

  try {
    // Validate input
    if (!email || !password) {
      console.log('❌ Login failed: Missing credentials');
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    console.log('📞 Calling authService.login...');

    // Use the real auth service (will be implemented)
    const result = await authService.login(email, password);

    console.log('🔑 Auth service returned:', {
      success: result.success,
      error: result.error,
      hasUser: !!result.user,
      hasAccessToken: !!result.accessToken,
      hasRefreshToken: !!result.refreshToken
    });

    if (!result.success) {
      console.log('❌ Login FAILED:', result.error);
      console.log('🔐 =================================');
      return res.status(401).json({
        success: false,
        error: result.error || 'Invalid email or password'
      });
    }

    // Return proper AuthResponse format
    console.log('✅ Login SUCCESS! Returning user:', result.user.email);
    console.log('🔐 =================================');

    res.json({
      success: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken
    });

  } catch (error) {
    console.error('💥 Login endpoint error:', error);
    console.log('🔐 =================================');
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// ============== REST OF AUTH ROUTES (commented out) ==============

/*
// Duplicate login route (commented out)
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email and password are required' 
    });
  }
  
  // Hardcoded mock response (bypass authService completely)
  if (email === 'admin@noah.com' || email === 'demo@noah.com' || email === 'test@example.com') {
    res.json({
      success: true,
      user: {
        id: '1',
        email: email,
        name: email.split('@')[0],
        role: 'user',
        organization: {
          id: '1',
          name: 'Noah Demo',
          slug: 'noah-demo'
        }
      },
      accessToken: 'demo-jwt-token-12345',
      refreshToken: 'demo-refresh-token-12345'
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'User not found. Try: admin@noah.com, demo@noah.com, or test@example.com'
    });
  }
});
*/

// Logout endpoint (temporarily disabled for debugging)
/*
app.post("/api/auth/logout", async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      await authService.logout(token);
    }
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout route error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Register endpoint
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, orgId } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email, and password are required' 
      });
    }
    
    const result = await authService.register(name, email, password);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Register route error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Refresh token endpoint
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token is required' 
      });
    }
    
    const result = await authService.refreshToken(refreshToken);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Refresh route error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get current user endpoint
app.get("/api/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access token required' 
      });
    }
    
    const result = await authService.getCurrentUser(token);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Me route error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
*/

// ============== PUBLIC ROUTES ==============

// Serve web interface at root
app.get("/", (req, res) => {
  const interfacePath = path.join(__dirname, "web-interface.html");
  if (fs.existsSync(interfacePath)) {
    res.sendFile(interfacePath);
  } else {
    res.send(`
      <h1>Noah Media Server</h1>
      <p>Server is running!</p>
      <p>API Endpoints:</p>
      <ul>
        <li><a href="/api/health">/api/health</a> - Health check</li>
        <li><a href="/api/media">/api/media</a> - List media</li>
      </ul>
    `);
  }
});

// Simple auth test endpoint - shows available users
app.get("/api/auth/simple-test", (req, res) => {
  const users = authService.getValidUsers();
  res.json({
    success: true,
    message: "Simple Auth is working!",
    availableUsers: users,
    instructions: "Use POST /api/auth/login with email and password from the list above"
  });
});

// EMERGENCY Password Reset - No auth required!
app.post("/api/emergency/fix-admin-password", async (req, res) => {
  console.log('🚨 EMERGENCY PASSWORD RESET REQUESTED');
  console.log('🚨 This endpoint will reset admin@visitdetroit.com password');

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@visitdetroit.com';
    const newPassword = process.env.ADMIN_PASSWORD || 'VisitDetroit2024!';

    // Check if we have real database auth
    if (authService.constructor && authService.constructor.name === 'AuthService') {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      const bcrypt = require("bcryptjs");

      console.log('🔧 Using bcryptjs to hash password...');
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      console.log('🔧 Hash generated, length:', hashedPassword.length);

      // Update or create the admin user
      const existingUser = await prisma.user.findUnique({
        where: { email: adminEmail }
      });

      if (existingUser) {
        console.log('🔧 Found existing user, updating password...');
        await prisma.user.update({
          where: { email: adminEmail },
          data: {
            passwordHash: hashedPassword,
            failedLoginAttempts: 0,
            lockoutUntil: null,
            status: 'active'
          }
        });
        console.log('✅ Password updated for existing user');
      } else {
        console.log('🔧 User not found, creating new admin user...');

        // Get or create organization
        let org = await prisma.organization.findFirst({
          where: { slug: 'visit-detroit' }
        });

        if (!org) {
          org = await prisma.organization.create({
            data: {
              name: 'Visit Detroit',
              slug: 'visit-detroit',
              planType: 'enterprise',
              storageQuotaBytes: BigInt(10 * 1024 * 1024 * 1024 * 1024)
            }
          });
        }

        await prisma.user.create({
          data: {
            orgId: org.id,
            email: adminEmail,
            name: 'Admin User',
            passwordHash: hashedPassword,
            role: 'admin',
            status: 'active',
            emailVerified: true,
            failedLoginAttempts: 0
          }
        });
        console.log('✅ New admin user created');
      }

      await prisma.$disconnect();

      return res.json({
        success: true,
        message: '🚨 EMERGENCY PASSWORD RESET SUCCESSFUL!',
        instructions: 'You can now login with these credentials:',
        credentials: {
          email: adminEmail,
          password: newPassword
        }
      });

    } else {
      return res.json({
        success: false,
        error: 'Database not connected - using mock auth',
        instructions: 'Your backend is not connected to a database. Check DATABASE_URL in Railway.'
      });
    }

  } catch (error) {
    console.error('🚨 EMERGENCY RESET ERROR:', error);
    res.status(500).json({
      success: false,
      error: 'Emergency reset failed',
      details: error.message
    });
  }
});

// Debug endpoint - Reset admin password
app.post("/api/debug/reset-admin-password", async (req, res) => {
  console.log('🔐 Resetting admin password...');

  // Only allow in development or with special flag
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PASSWORD_RESET !== 'true') {
    return res.status(403).json({
      success: false,
      error: 'Password reset not allowed in production'
    });
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@visitdetroit.com';
    const newPassword = process.env.ADMIN_PASSWORD || 'VisitDetroit2024!';

    // Check if we have real database auth
    if (authService.constructor && authService.constructor.name === 'AuthService') {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      const bcrypt = require("bcryptjs");

      // Find the admin user
      const adminUser = await prisma.user.findUnique({
        where: { email: adminEmail }
      });

      if (!adminUser) {
        await prisma.$disconnect();
        return res.status(404).json({
          success: false,
          error: 'Admin user not found'
        });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update the password
      await prisma.user.update({
        where: { email: adminEmail },
        data: {
          passwordHash: hashedPassword,
          failedLoginAttempts: 0,
          lockoutUntil: null,
          status: 'active'
        }
      });

      await prisma.$disconnect();

      console.log('✅ Admin password reset successfully');

      return res.json({
        success: true,
        message: 'Admin password reset successfully',
        credentials: {
          email: adminEmail,
          password: newPassword
        }
      });

    } else {
      return res.json({
        success: false,
        error: 'Database not connected - using mock auth'
      });
    }

  } catch (error) {
    console.error('Error resetting admin password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset admin password',
      details: error.message
    });
  }
});

// Debug endpoint - Create test user (for testing only)
app.post("/api/debug/create-test-user", async (req, res) => {
  console.log('🧪 Creating test user...');

  // Only allow in development/testing
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_USER !== 'true') {
    return res.status(403).json({
      success: false,
      error: 'Test user creation not allowed in production'
    });
  }

  try {
    const { email, password, name } = req.body;

    // Use defaults if not provided
    const testEmail = email || 'test@visitdetroit.com';
    const testPassword = password || 'TestUser123!';
    const testName = name || 'Test User';

    // Check if we have real database auth
    if (authService.constructor && authService.constructor.name === 'AuthService') {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      const bcrypt = require("bcryptjs");

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email: testEmail }
      });

      if (existingUser) {
        // Update password if user exists
        const hashedPassword = await bcrypt.hash(testPassword, 10);
        await prisma.user.update({
          where: { email: testEmail },
          data: {
            passwordHash: hashedPassword,
            failedLoginAttempts: 0,
            lockoutUntil: null,
            status: 'active'
          }
        });

        await prisma.$disconnect();

        return res.json({
          success: true,
          message: 'Test user password updated',
          credentials: {
            email: testEmail,
            password: testPassword
          }
        });
      }

      // Create organization if needed
      let org = await prisma.organization.findFirst({
        where: { slug: 'visit-detroit' }
      });

      if (!org) {
        org = await prisma.organization.create({
          data: {
            name: 'Visit Detroit',
            slug: 'visit-detroit',
            planType: 'enterprise',
            storageQuotaBytes: BigInt(10 * 1024 * 1024 * 1024 * 1024), // 10TB
            features: {
              b2Storage: true,
              autoCompress: true,
              aiTagging: false,
              unlimitedUsers: true
            },
            metadata: {
              description: "Detroit's official convention and visitors bureau",
              b2BucketPrefix: "visit-detroit/"
            }
          }
        });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      const newUser = await prisma.user.create({
        data: {
          orgId: org.id,
          email: testEmail,
          name: testName,
          passwordHash: hashedPassword,
          role: 'user',
          status: 'active',
          emailVerified: true,
          failedLoginAttempts: 0
        }
      });

      await prisma.$disconnect();

      console.log('✅ Test user created:', testEmail);

      return res.json({
        success: true,
        message: 'Test user created successfully',
        credentials: {
          email: testEmail,
          password: testPassword
        },
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role
        }
      });

    } else {
      // Using mock auth
      return res.json({
        success: true,
        message: 'Mock auth mode - any user works',
        info: 'Database not connected. Using mock authentication.',
        mockUsers: [
          'admin@noah.com',
          'demo@noah.com',
          'test@example.com',
          'user@demo.com',
          'admin@visitdetroit.com',
          'demo@visitdetroit.com',
          'test@visitdetroit.com'
        ],
        note: 'Use any of these emails with any password (6+ characters)'
      });
    }

  } catch (error) {
    console.error('Error creating test user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test user',
      details: error.message
    });
  }
});

// Debug endpoint - Check database and users
app.get("/api/debug/auth-status", async (req, res) => {
  console.log('🔍 Checking auth status...');

  const status = {
    timestamp: new Date().toISOString(),
    authServiceType: 'unknown',
    databaseConnected: false,
    usersInDatabase: [],
    environmentVariables: {
      DATABASE_URL: process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET',
      ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'NOT SET',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 'SET (hidden)' : 'NOT SET',
      ENABLE_DEBUG_LOGIN: process.env.ENABLE_DEBUG_LOGIN || 'NOT SET',
      DEBUG_EMAIL: process.env.DEBUG_EMAIL || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT SET'
    },
    mockUsers: []
  };

  // Check what auth service is loaded
  if (authService.constructor && authService.constructor.name) {
    status.authServiceType = authService.constructor.name;
  } else if (authService.login) {
    // Check if it's the mock service
    const testResult = await authService.login('test@test.com', '123456');
    if (testResult.error && testResult.error.includes('Try:')) {
      status.authServiceType = 'MockAuthService';
      // Extract mock users from error message
      const errorMsg = testResult.error;
      const match = errorMsg.match(/Try: (.+)/);
      if (match) {
        status.mockUsers = match[1].split(', ');
      }
    } else {
      status.authServiceType = 'RealAuthService';
    }
  }

  // Try to check database connection if real auth service
  if (status.authServiceType === 'RealAuthService' || status.authServiceType === 'AuthService') {
    try {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

      // Try to count users
      const userCount = await prisma.user.count();
      status.databaseConnected = true;

      // Get user emails (for debugging)
      const users = await prisma.user.findMany({
        select: {
          email: true,
          role: true,
          status: true,
          createdAt: true
        }
      });

      status.usersInDatabase = users;
      status.userCount = userCount;

      await prisma.$disconnect();
    } catch (error) {
      console.error('Database check failed:', error.message);
      status.databaseError = error.message;
    }
  }

  console.log('📊 Auth status:', status);
  res.json(status);
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uploadsDir: uploadsDir,
    corsEnabled: true,
    version: "2.0.1-fixed",
  });
});

// Get all media assets (scans folder on each request)
app.get("/api/media", async (req, res) => {
  try {
    console.log("📋 GET /api/media - Scanning uploads folder...");
    const { source = 'all' } = req.query; // 'local', 'b2', 'all'
    
    // Check if request is coming through a proxy (Vite dev server)
    const isProxied =
      req.headers["x-forwarded-host"] || req.headers["x-forwarded-for"];
    
    let assets = [];
    let folders = [];
    
    // Get local assets
    if (source === 'local' || source === 'all') {
      const localResult = await scanUploadsFolder(isProxied);
      assets = localResult.assets || localResult;
      folders = localResult.folders || [];
    }
    
    // Get B2 assets if configured
    if (b2Storage.isEnabled() && (source === 'b2' || source === 'all')) {
      console.log("☁️ Fetching B2 assets...");
      const b2Files = await b2Storage.listFiles('uploads/', 10000, true); // Include folders
      
      // Separate files and folders
      const b2FilesOnly = b2Files.filter(f => !f.isFolder);
      const b2Folders = b2Files.filter(f => f.isFolder);
      
      const b2Assets = await b2Storage.transformToMediaAssets(b2FilesOnly);
      
      // Add B2 folders to the folders list with proper structure
      const transformedB2Folders = b2Folders.map(f => {
        const fullPath = f.fullPath || f.key.replace(/\/$/, '');
        // Remove 'uploads/' prefix for consistency with frontend navigation
        const path = fullPath.startsWith('uploads/') ? fullPath.substring(8) : fullPath;
        return {
          id: f.id,
          name: f.name,
          type: 'folder',
          path: path, // Remove uploads/ prefix
          parent: f.parent || null,
          storageLocation: 'b2',
          createdAt: f.lastModified,
          modifiedAt: f.lastModified,
          fileCount: 0, // Could be enhanced later
          folderCount: 0, // Could be enhanced later
        };
      });
      
      if (source === 'b2') {
        folders = transformedB2Folders;
      } else {
        folders = [...folders, ...transformedB2Folders];
      }
      
      assets = [...assets, ...b2Assets];
      console.log(`☁️ Added ${b2Assets.length} B2 assets and ${b2Folders.length} folders`);
    }

    res.json({
      success: true,
      assets: assets,
      folders: folders,
      count: assets.length,
      sources: {
        local: source === 'local' || source === 'all',
        b2: b2Storage.isEnabled() && (source === 'b2' || source === 'all')
      },
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ Returned ${assets.length} assets`);
  } catch (error) {
    console.error("❌ Error fetching media:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      assets: [],
      count: 0,
    });
  }
});

// Upload media files
app.post("/api/media/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("📤 POST /api/media/upload - File upload started");
    
    // Get upload destination from request (local, b2, both)
    const { destination = 'local' } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file provided",
      });
    }

    console.log("📝 File details:", {
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      destination: destination,
    });

    let localMetadata = null;
    let b2Result = null;
    
    // Always save locally first
    localMetadata = await getFileMetadata(req.file.path, req.file.filename);
    
    // Upload to B2 if requested
    if ((destination === 'b2' || destination === 'both') && b2Storage.isEnabled()) {
      try {
        console.log("☁️ Uploading to B2...");
        const ext = path.extname(req.file.originalname);
        const b2Key = `uploads/${req.file.filename}`;
        
        b2Result = await b2Storage.uploadFile(
          req.file.path,
          b2Key,
          { originalName: req.file.originalname }
        );
        console.log("☁️ B2 upload successful");
        
        // If B2 only, delete local file
        if (destination === 'b2') {
          fs.unlinkSync(req.file.path);
          console.log("🗑️ Local file deleted (B2 only mode)");
        }
      } catch (b2Error) {
        console.error("⚠️ B2 upload failed:", b2Error);
        // Continue with local storage on B2 failure
      }
    }

    res.json({
      success: true,
      asset: {
        ...localMetadata,
        originalName: req.file.originalname,
        storageLocation: destination,
        b2Url: b2Result?.url || null,
        b2Key: b2Result?.key || null,
      },
      message: "File uploaded successfully",
      uploadedTo: {
        local: destination === 'local' || destination === 'both',
        b2: b2Result !== null,
      },
    });

    console.log("✅ File uploaded successfully:", req.file.filename);
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete media asset
app.delete("/api/media/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    fs.unlinkSync(filePath);
    console.log("🗑️ Deleted file:", filename);

    res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Directory and file management routes
app.get("/api/files/directory", async (req, res) => {
  try {
    const getDirectoryStructure = async (dir, basePath = '') => {
      const items = [];
      
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          const relativePath = path.join(basePath, file.name);
          
          if (file.isDirectory()) {
            const children = await getDirectoryStructure(fullPath, relativePath);
            items.push({
              name: file.name,
              type: 'folder',
              path: `/${relativePath}`.replace(/\\/g, '/'),
              children: children
            });
          } else {
            const stats = fs.statSync(fullPath);
            const ext = path.extname(file.name).toLowerCase();
            
            items.push({
              name: file.name,
              type: 'file',
              path: `/${relativePath}`.replace(/\\/g, '/'),
              size: stats.size,
              modified: stats.mtime.toISOString(),
              extension: ext.substring(1)
            });
          }
        }
      } catch (error) {
        console.log('Error reading directory:', error);
      }
      
      return items;
    };

    const directories = await getDirectoryStructure(uploadsDir);
    
    res.json({ 
      success: true,
      directories 
    });
  } catch (error) {
    console.error('Error getting directory structure:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get directory structure',
      message: error.message 
    });
  }
});

// Create new folder
app.post("/api/files/folder", async (req, res) => {
  try {
    const { name, parentPath = '', destination = 'local' } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false,
        error: 'Folder name is required' 
      });
    }
    
    const results = { local: false, b2: false };
    const errors = [];
    
    // Create local folder if requested
    if (destination === 'local' || destination === 'both') {
      try {
        const folderPath = path.join(uploadsDir, parentPath, name);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        results.local = true;
        console.log(`📁 Created local folder: ${folderPath}`);
      } catch (error) {
        errors.push(`Local: ${error.message}`);
      }
    }
    
    // Create B2 folder if requested and configured
    if ((destination === 'b2' || destination === 'both') && b2Storage.isEnabled()) {
      try {
        const b2Path = parentPath ? `uploads/${parentPath}/${name}/` : `uploads/${name}/`;
        await b2Storage.createFolder(b2Path);
        results.b2 = true;
        console.log(`☁️ Created B2 folder: ${b2Path}`);
      } catch (error) {
        errors.push(`B2: ${error.message}`);
      }
    }
    
    if (!results.local && !results.b2) {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to create folder',
        errors: errors
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Folder created successfully',
      path: path.join(parentPath, name).replace(/\\/g, '/'),
      createdIn: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create folder',
      message: error.message 
    });
  }
});

// Get B2 storage status
app.get("/api/storage/status", async (req, res) => {
  try {
    const b2Stats = await b2Storage.getStats();
    const localFiles = await scanUploadsFolder();
    const localAssets = localFiles.assets || localFiles;
    const localSize = localAssets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    
    res.json({
      success: true,
      storage: {
        local: {
          enabled: true,
          totalFiles: localAssets.length,
          totalSize: localSize,
          formattedSize: formatFileSize(localSize),
        },
        b2: b2Stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting storage status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Get assets in a specific folder
app.get("/api/media/folder", async (req, res) => {
  try {
    const { path: folderPath = '', source = 'all' } = req.query;
    console.log(`📁 GET /api/media/folder - Fetching assets in folder: \"${folderPath}\" from source: ${source}`);
    
    let assets = [];
    let folders = [];
    
    // Get local assets in folder
    if (source === 'local' || source === 'all') {
      const localResult = await scanUploadsFolder();
      const localAssets = localResult.assets || [];
      const localFolders = localResult.folders || [];
      
      // Filter assets for the specific folder
      const filteredLocalAssets = localAssets.filter(asset => {
        if (!folderPath) {
          return !asset.folder; // Root level assets
        }
        return asset.folder === folderPath;
      });
      
      // Filter folders for the specific level
      const filteredLocalFolders = localFolders.filter(folder => {
        if (!folderPath) {
          return !folder.parent; // Root level folders
        }
        return folder.parent === folderPath;
      });
      
      assets = [...assets, ...filteredLocalAssets];
      folders = [...folders, ...filteredLocalFolders];
    }
    
    // Get B2 assets in folder
    if (b2Storage.isEnabled() && (source === 'b2' || source === 'all')) {
      console.log(`☁️ Fetching B2 assets in folder: ${folderPath}`);
      
      try {
        const b2FolderPath = folderPath ? `uploads/${folderPath}` : 'uploads/';
        const b2Files = await b2Storage.listFilesInFolder(b2FolderPath);
        const b2Assets = await b2Storage.transformToMediaAssets(b2Files);
        
        // Get subfolders - use the folder path with trailing slash for proper prefix matching
        const prefixPath = b2FolderPath.endsWith('/') ? b2FolderPath : `${b2FolderPath}/`;
        const b2AllFiles = await b2Storage.listFiles(prefixPath, 1000, true);
        const b2Folders = b2AllFiles.filter(f => f.isFolder).map(f => {
          const fullPath = f.fullPath || f.key.replace(/\/$/, '');
          // Remove 'uploads/' prefix for consistency with frontend navigation
          const path = fullPath.startsWith('uploads/') ? fullPath.substring(8) : fullPath;
          return {
            id: f.id,
            name: f.name,
            type: 'folder',
            path: path,
            parent: f.parent || null,
            storageLocation: 'b2',
            createdAt: f.lastModified,
            modifiedAt: f.lastModified,
            fileCount: 0,
            folderCount: 0,
          };
        });
        
        assets = [...assets, ...b2Assets];
        folders = [...folders, ...b2Folders];
        
        console.log(`☁️ Added ${b2Assets.length} B2 assets and ${b2Folders.length} folders`);
      } catch (error) {
        console.error(`❌ Error fetching B2 folder ${folderPath}:`, error);
        // Continue with empty results rather than failing completely
      }
    }
    
    res.json({
      success: true,
      assets,
      folders,
      currentFolder: folderPath,
      count: assets.length,
      folderCount: folders.length,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Error fetching folder assets:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      assets: [],
      folders: [],
    });
  }
});

// Search assets across all folders
app.get("/api/media/search", async (req, res) => {
  try {
    const { q: query = '', source = 'all' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        assets: [],
      });
    }
    
    console.log(`🔍 GET /api/media/search - Searching for: ${query}`);
    
    let assets = [];
    
    // Search local assets
    if (source === 'local' || source === 'all') {
      const localResult = await scanUploadsFolder();
      const localAssets = localResult.assets || [];
      
      const filteredLocalAssets = localAssets.filter(asset => {
        const searchLower = query.toLowerCase();
        return asset.name.toLowerCase().includes(searchLower) ||
               asset.type.toLowerCase().includes(searchLower) ||
               (asset.tags && asset.tags.some(tag => tag.toLowerCase().includes(searchLower)));
      });
      
      assets = [...assets, ...filteredLocalAssets];
    }
    
    // Search B2 assets
    if (b2Storage.isEnabled() && (source === 'b2' || source === 'all')) {
      console.log(`☁️ Searching B2 for: ${query}`);
      const b2Files = await b2Storage.searchFiles(query);
      const b2Assets = await b2Storage.transformToMediaAssets(b2Files);
      
      assets = [...assets, ...b2Assets];
      console.log(`☁️ Found ${b2Assets.length} B2 assets`);
    }
    
    res.json({
      success: true,
      assets,
      query,
      count: assets.length,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Error searching assets:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      assets: [],
    });
  }
});

// Get single media asset (moved after folder/search routes to avoid conflicts)
app.get("/api/media/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    const metadata = await getFileMetadata(filePath, filename);

    res.json({
      success: true,
      asset: metadata,
    });
  } catch (error) {
    console.error("❌ Error fetching file:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get recent files
app.get("/api/files/recent", async (req, res) => {
  try {
    const recentFiles = [];
    
    const getAllFiles = (dir, basePath = '') => {
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          const relativePath = path.join(basePath, file.name);
          
          if (file.isDirectory()) {
            getAllFiles(fullPath, relativePath);
          } else {
            const stats = fs.statSync(fullPath);
            recentFiles.push({
              name: file.name,
              path: `/${relativePath}`.replace(/\\/g, '/'),
              size: stats.size,
              modified: stats.mtime,
              type: 'file'
            });
          }
        }
      } catch (error) {
        console.log('Error reading files:', error);
      }
    };
    
    getAllFiles(uploadsDir);
    
    // Sort by modified date and return top 20
    recentFiles.sort((a, b) => b.modified - a.modified);
    
    res.json({ 
      success: true,
      files: recentFiles.slice(0, 20).map(f => ({
        ...f,
        modified: f.modified.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error getting recent files:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get recent files',
      message: error.message 
    });
  }
});


// Error handling middleware
app.use((error, _unusedReq, res, _unusedNext) => {
  console.error("❌ Server error:", error);
  res.status(500).json({
    success: false,
    error: error.message || "Internal server error",
  });
});

// B2 Sync endpoints
app.get("/api/sync/status", (req, res) => {
  res.json({
    success: true,
    sync: b2SyncService.getSyncStatus()
  });
});

app.post("/api/sync/start", (req, res) => {
  b2SyncService.startAutoSync();
  res.json({
    success: true,
    message: "Auto-sync started",
    status: b2SyncService.getSyncStatus()
  });
});

app.post("/api/sync/stop", (req, res) => {
  b2SyncService.stopAutoSync();
  res.json({
    success: true,
    message: "Auto-sync stopped",
    status: b2SyncService.getSyncStatus()
  });
});

app.post("/api/sync/now", async (req, res) => {
  console.log("📡 Manual sync requested");
  const result = await b2SyncService.syncToB2();
  res.json({
    success: result.success,
    message: result.message || "Sync completed",
    stats: result.stats
  });
});

// ============== AUTH ROUTES (placed at end to test) ==============
app.get("/api/auth/final-test", (req, res) => {
  res.json({ message: "Auth final test route working" });
});

// Temporary debug route to check database users
app.get("/api/auth/debug-users", async (req, res) => {
  try {
    if (authService && authService.findUserByEmail) {
      // Try to find the Visit Detroit users
      const adminUser = await authService.findUserByEmail('admin@visitdetroit.com');
      const demoUser = await authService.findUserByEmail('demo@visitdetroit.com');
      const testUser = await authService.findUserByEmail('test@visitdetroit.com');
      
      res.json({
        adminUserExists: !!adminUser,
        demoUserExists: !!demoUser,
        testUserExists: !!testUser,
        adminUserData: adminUser ? {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          hasPassword: !!adminUser.passwordHash
        } : null,
        authServiceType: "real"
      });
    } else {
      res.json({ error: "AuthService not available", usingMockAuth: true });
    }
  } catch (error) {
    res.json({ error: error.message, usingMockAuth: true });
  }
});

// Simple user creation endpoint for testing
app.post("/api/auth/create-test-user", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ 
        success: false, 
        error: "Email, password, and name are required" 
      });
    }

    // Use the real auth service to create user
    if (authService && authService.register) {
      const result = await authService.register(name, email, password, 'visit-detroit-org');
      res.json({
        success: true,
        message: "Test user created successfully",
        user: {
          email: email,
          name: name
        }
      });
    } else {
      res.json({ 
        success: false, 
        error: "Real auth service not available" 
      });
    }
  } catch (error) {
    console.error('Create test user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/authentication/final-test", (req, res) => {
  res.json({ message: "Authentication final test route working" });
});

app.get("/api/login/final-test", (req, res) => {
  res.json({ message: "Login final test route working" });
});

app.post("/api/auth/login-final", (req, res) => {
  res.json({ success: true, message: "Login final working!" });
});

app.post("/api/authentication/login-final", (req, res) => {
  res.json({ success: true, message: "Authentication login final working!" });
});

// Start server
app.listen(PORT, "0.0.0.0", async () => {
  // Ensure admin user exists on startup (optional, fails gracefully)
  try {
    await authService.ensureAdminUser();
    console.log("✅ Database connection established");
  } catch (error) {
    console.log("⚠️ Database connection failed, running in media-only mode:", error.message);
  }
  // Railway provides different environment variables
  const railwayUrl = process.env.RAILWAY_STATIC_URL || 
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_URL;
    
  const serverUrl = railwayUrl ? `https://${railwayUrl}` : `http://localhost:${PORT}`;
  const isProduction = process.env.NODE_ENV === 'production';
  
  console.log("");
  console.log("🚀 Enhanced Media Server v2.0 Started!");
  console.log("======================================");
  console.log(`📡 Server: ${serverUrl}`);
  console.log(`📁 Uploads: ${uploadsDir}`);
  console.log(`🔌 CORS: ${isDevelopment ? 'Enabled for localhost:3001-3010, 5173' : 'Enabled for all origins'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Port: ${PORT}`);
  
  if (isProduction) {
    console.log("");
    console.log("📊 Railway Detection:");
    console.log(`  RAILWAY_STATIC_URL: ${process.env.RAILWAY_STATIC_URL || 'not set'}`);
    console.log(`  RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'}`);
    console.log(`  RAILWAY_URL: ${process.env.RAILWAY_URL || 'not set'}`);
  }
  
  // B2 Storage Status
  console.log("");
  console.log("☁️ B2 Storage:");
  if (b2Storage.isEnabled()) {
    console.log(`  ✅ B2 Enabled`);
    console.log(`  Bucket: ${process.env.B2_BUCKET_NAME}`);
    console.log(`  Endpoint: ${process.env.B2_ENDPOINT || 'Default B2'}`);
  } else {
    console.log(`  ⚠️ B2 Disabled - Configure B2_KEY_ID, B2_APPLICATION_KEY, and B2_BUCKET_NAME to enable`);
  }
  
  console.log("");
  console.log("📍 Endpoints:");
  console.log(`  WEB    ${serverUrl}/`);
  console.log(`  GET    ${serverUrl}/api/health`);
  console.log(`  GET    ${serverUrl}/api/media?source=[local|b2|all]`);
  console.log(`  GET    ${serverUrl}/api/media/folder?path=[folder]&source=[local|b2|all]`);
  console.log(`  GET    ${serverUrl}/api/media/search?q=[query]&source=[local|b2|all]`);
  console.log(`  GET    ${serverUrl}/api/storage/status`);
  console.log(`  POST   ${serverUrl}/api/media/upload`);
  console.log(`  DELETE ${serverUrl}/api/media/:filename`);
  console.log(`  Static ${serverUrl}/uploads/[filename]`);
  console.log("");

  // Initial scan
  const scanResult = await scanUploadsFolder();
  const assets = scanResult.assets || scanResult;
  console.log(`📊 Initial scan: ${assets.length} local media assets available`);

  if (assets.length > 0) {
    console.log("📸 Sample assets:");
    assets.slice(0, 3).forEach((asset) => {
      console.log(`  - ${asset.name} (${asset.type})`);
    });
  }

  console.log("");
  console.log("✅ Server ready to handle requests!");
  console.log("======================================");
  
  // Start auto-sync if B2 is configured
  if (b2SyncService.syncEnabled && process.env.B2_AUTO_SYNC !== 'false') {
    console.log("\n🔄 Starting B2 auto-sync...");
    b2SyncService.startAutoSync();
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down server...");
  if (b2SyncService) {
    b2SyncService.stopAutoSync();
  }
  process.exit(0);
});
