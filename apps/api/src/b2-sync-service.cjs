const fs = require('fs').promises;
const path = require('path');
const B2StorageService = require('./b2-storage.cjs');

/**
 * B2 Sync Service
 * Automatically syncs local files to B2 storage
 */
class B2SyncService {
  constructor(config = {}) {
    this.b2Storage = new B2StorageService({
      keyId: config.keyId || process.env.B2_KEY_ID,
      applicationKey: config.applicationKey || process.env.B2_APPLICATION_KEY,
      bucketName: config.bucketName || process.env.B2_BUCKET_NAME,
      endpoint: config.endpoint || process.env.B2_ENDPOINT,
      region: config.region || process.env.B2_REGION
    });
    
    this.uploadsDir = config.uploadsDir || path.join(__dirname, '../../../uploads');
    this.syncInterval = config.syncInterval || 300000; // 5 minutes default
    this.syncEnabled = this.b2Storage.isEnabled() && (config.autoSync !== false);
    this.syncInProgress = false;
    this.syncStats = {
      lastSync: null,
      filesUploaded: 0,
      filesSkipped: 0,
      totalBytes: 0,
      errors: []
    };
    
    if (this.syncEnabled) {
      console.log('✅ B2 Sync Service initialized');
      console.log(`  Sync interval: ${this.syncInterval / 1000} seconds`);
      console.log(`  Uploads directory: ${this.uploadsDir}`);
    } else {
      console.log('⚠️ B2 Sync Service disabled (B2 not configured or autoSync disabled)');
    }
  }
  
  /**
   * Start automatic sync
   */
  startAutoSync() {
    if (!this.syncEnabled) {
      console.log('⚠️ Cannot start auto-sync: B2 not configured');
      return;
    }
    
    // Initial sync
    this.syncToB2();
    
    // Schedule periodic syncs
    this.syncTimer = setInterval(() => {
      this.syncToB2();
    }, this.syncInterval);
    
    console.log('🔄 Auto-sync started');
  }
  
  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('⏹️ Auto-sync stopped');
    }
  }
  
  /**
   * Sync local files to B2
   */
  async syncToB2() {
    if (!this.syncEnabled) {
      return { success: false, message: 'B2 sync not enabled' };
    }
    
    if (this.syncInProgress) {
      console.log('⚠️ Sync already in progress, skipping...');
      return { success: false, message: 'Sync already in progress' };
    }
    
    this.syncInProgress = true;
    this.syncStats = {
      lastSync: new Date(),
      filesUploaded: 0,
      filesSkipped: 0,
      totalBytes: 0,
      errors: []
    };
    
    console.log('\n🔄 Starting B2 sync...');
    console.log(`📁 Scanning ${this.uploadsDir}`);
    
    try {
      // Get list of existing files in B2
      const b2Files = await this.b2Storage.listFiles('uploads/', 10000);
      const b2FileMap = new Map(b2Files.map(f => [f.key, f]));
      
      // Scan local files
      const localFiles = await this.scanLocalFiles(this.uploadsDir);
      
      console.log(`📊 Found ${localFiles.length} local files`);
      console.log(`☁️ Found ${b2Files.length} files in B2`);
      
      // Sync each local file
      for (const localFile of localFiles) {
        const b2Key = `uploads/${localFile.relativePath}`;
        const b2File = b2FileMap.get(b2Key);
        
        // Check if file needs sync
        if (b2File && b2File.size === localFile.size) {
          // File exists and size matches, skip
          this.syncStats.filesSkipped++;
        } else {
          // Upload file
          try {
            console.log(`📤 Uploading: ${localFile.relativePath}`);
            await this.b2Storage.uploadFile(
              localFile.fullPath,
              b2Key,
              { originalName: localFile.name }
            );
            this.syncStats.filesUploaded++;
            this.syncStats.totalBytes += localFile.size;
          } catch (error) {
            console.error(`❌ Failed to upload ${localFile.name}:`, error.message);
            this.syncStats.errors.push({
              file: localFile.name,
              error: error.message
            });
          }
        }
      }
      
      // Report results
      console.log('\n✅ Sync completed!');
      console.log(`  📤 Uploaded: ${this.syncStats.filesUploaded} files`);
      console.log(`  ⏭️ Skipped: ${this.syncStats.filesSkipped} files (already in sync)`);
      console.log(`  📊 Total uploaded: ${this.formatBytes(this.syncStats.totalBytes)}`);
      if (this.syncStats.errors.length > 0) {
        console.log(`  ⚠️ Errors: ${this.syncStats.errors.length} files failed`);
      }
      
      this.syncInProgress = false;
      return {
        success: true,
        stats: this.syncStats
      };
      
    } catch (error) {
      console.error('❌ Sync error:', error);
      this.syncInProgress = false;
      return {
        success: false,
        message: error.message,
        stats: this.syncStats
      };
    }
  }
  
  /**
   * Scan local files recursively
   */
  async scanLocalFiles(dir, baseDir = dir, files = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanLocalFiles(fullPath, baseDir, files);
        } else if (entry.isFile()) {
          // Skip system files
          if (this.shouldSkipFile(entry.name)) continue;
          
          const stats = await fs.stat(fullPath);
          const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          
          files.push({
            name: entry.name,
            fullPath,
            relativePath,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
      
      return files;
    } catch (error) {
      console.error('Error scanning directory:', error);
      return files;
    }
  }
  
  /**
   * Check if file should be skipped
   */
  shouldSkipFile(filename) {
    const skipPatterns = [
      '.DS_Store',
      'Thumbs.db',
      'desktop.ini',
      '.gitkeep',
      '*.tmp',
      '*.temp'
    ];
    
    return skipPatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(filename);
      }
      return filename === pattern;
    });
  }
  
  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      enabled: this.syncEnabled,
      inProgress: this.syncInProgress,
      autoSync: !!this.syncTimer,
      interval: this.syncInterval,
      stats: this.syncStats
    };
  }
  
  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = B2SyncService;