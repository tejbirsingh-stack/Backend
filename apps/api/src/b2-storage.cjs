const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

/**
 * Simplified B2 Storage Service for Media Server
 * Uses S3-compatible API for Backblaze B2
 */
class B2StorageService {
  constructor(config) {
    // Initialize S3 client for B2 (S3-compatible)
    this.s3Client = null;
    this.bucket = null;
    this.enabled = false;
    
    // Check if B2 configuration is provided
    if (config && config.keyId && config.applicationKey && config.bucketName) {
      this.s3Client = new S3Client({
        region: config.region || 'us-west-002',
        endpoint: config.endpoint || 'https://s3.us-west-002.backblazeb2.com',
        credentials: {
          accessKeyId: config.keyId,
          secretAccessKey: config.applicationKey,
        },
        forcePathStyle: true, // Required for B2
      });
      
      this.bucket = config.bucketName;
      this.enabled = true;
      
      console.log('✅ B2 Storage Service initialized');
      console.log(`  Bucket: ${this.bucket}`);
      console.log(`  Endpoint: ${config.endpoint || 'https://s3.us-west-002.backblazeb2.com'}`);
    } else {
      console.log('⚠️ B2 Storage Service disabled - missing configuration');
    }
  }
  
  /**
   * Check if B2 is enabled and configured
   */
  isEnabled() {
    return this.enabled;
  }
  
  /**
   * List files from B2 bucket with proper folder structure
   */
  async listFiles(prefix = '', maxKeys = 1000, includeFolders = false) {
    if (!this.enabled) return [];
    
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
        Delimiter: includeFolders ? '/' : undefined, // Use delimiter to get folder structure
      });
      
      const response = await this.s3Client.send(command);
      
      const items = [];
      
      // Add folders (CommonPrefixes)
      if (includeFolders && response.CommonPrefixes) {
        for (const prefixObj of response.CommonPrefixes) {
          const folderPath = prefixObj.Prefix.replace(/\/$/, '');
          items.push({
            id: folderPath,
            name: path.basename(folderPath),
            key: prefixObj.Prefix,
            size: 0,
            lastModified: new Date(),
            type: 'folder',
            storageLocation: 'b2',
            bucket: this.bucket,
            isFolder: true,
            // Extract parent folder path for navigation
            parent: this.getParentFolder(folderPath, prefix),
            fullPath: folderPath,
          });
        }
      }
      
      // Add files
      const files = (response.Contents || []).map(obj => {
        const folderPath = this.extractFolderFromKey(obj.Key, prefix);
        return {
          id: path.basename(obj.Key),
          name: path.basename(obj.Key).replace(/^\d+-/, ""),
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          type: this.getFileType(obj.Key),
          storageLocation: 'b2',
          bucket: this.bucket,
          isFolder: false,
          fullPath: obj.Key, // Include full path for folder structure
          folder: folderPath, // Extract folder for navigation
        };
      });
      
      items.push(...files);
      
      console.log(`📊 Found ${files.length} files${includeFolders ? ` and ${items.length - files.length} folders` : ''} in B2`);
      return items;
      
    } catch (error) {
      console.error('❌ Error listing B2 files:', error);
      return [];
    }
  }
  
  /**
   * Get presigned URL for a file
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    if (!this.enabled) return null;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      const url = await getSignedUrl(this.s3Client, command, { 
        expiresIn // URL expires in 1 hour by default
      });
      
      return url;
      
    } catch (error) {
      console.error('❌ Error generating presigned URL:', error);
      return null;
    }
  }
  
  /**
   * Upload file to B2
   */
  async uploadFile(filePath, key, metadata = {}) {
    if (!this.enabled) {
      throw new Error('B2 Storage is not configured');
    }
    
    try {
      // Read file
      const fileContent = fs.readFileSync(filePath);
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      
      // If no key provided, generate one
      if (!key) {
        const ext = path.extname(filePath);
        key = `uploads/${uuidv4()}${ext}`;
      }
      
      // Upload to B2
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          originalName: path.basename(filePath),
        },
      });
      
      await this.s3Client.send(command);
      
      console.log(`✅ Uploaded to B2: ${key}`);
      
      // Return file info
      return {
        key,
        bucket: this.bucket,
        size: fileContent.length,
        contentType,
        url: await this.getPresignedUrl(key),
        storageLocation: 'b2',
      };
      
    } catch (error) {
      console.error('❌ Error uploading to B2:', error);
      throw error;
    }
  }
  
  /**
   * Upload stream to B2 (for direct uploads)
   */
  async uploadStream(stream, key, contentType, metadata = {}) {
    if (!this.enabled) {
      throw new Error('B2 Storage is not configured');
    }
    
    try {
      // Use @aws-sdk/lib-storage to handle flowing readable streams 
      // without needing to know the content-length or hashing upfront
      const { Upload } = require('@aws-sdk/lib-storage');

      // const upload = new Upload({
      //   client: this.s3Client,
      //   params: {
      //     Bucket: this.bucket,
      //     Key: key,
      //     Body: stream,
      //     ContentType: contentType,
      //     Metadata: {
      //       ...metadata,
      //       uploadedAt: new Date().toISOString(),
      //     },
      //   },
      // });
      
      // await upload.done();
      const upload = new Upload({
      client: this.s3Client,

      params: {
      Bucket: this.bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
      Metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
      },
    },

  // Upload each part in 100 MB chunks
  partSize: 100 * 1024 * 1024,

  // Upload up to 5 parts concurrently
  queueSize: 5,

  // Clean up uploaded parts if an error occurs
  leavePartsOnError: false,
});



await upload.done();
      
      console.log(`✅ Stream uploaded to B2: ${key}`);
      
      return {
        key,
        bucket: this.bucket,
        contentType,
        url: await this.getPresignedUrl(key),
        storageLocation: 'b2',
      };
      
    } catch (error) {
      console.error('❌ Error uploading stream to B2:', error);
      throw error;
    }
  }
  
  /**
   * Delete file from B2
   */
  async deleteFile(key) {
    if (!this.enabled) {
      throw new Error('B2 Storage is not configured');
    }
    
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      
      console.log(`✅ Deleted from B2: ${key}`);
      return true;
      
    } catch (error) {
      console.error('❌ Error deleting from B2:', error);
      throw error;
    }
  }
  
  /**
   * Create a folder in B2 (creates a placeholder object)
   */
  async createFolder(folderPath) {
    if (!this.enabled) {
      throw new Error('B2 Storage is not configured');
    }
    
    try {
      // Ensure folder path ends with /
      const key = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
      
      // Create a placeholder object to represent the folder
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: '', // Empty content for folder placeholder
        ContentType: 'application/x-directory',
        Metadata: {
          createdAt: new Date().toISOString(),
          type: 'folder',
        },
      });
      
      await this.s3Client.send(command);
      
      console.log(`📁 Created folder in B2: ${key}`);
      
      return {
        key,
        bucket: this.bucket,
        type: 'folder',
        storageLocation: 'b2',
      };
      
    } catch (error) {
      console.error('❌ Error creating folder in B2:', error);
      throw error;
    }
  }
  
  /**
   * Check if file exists in B2
   */
  async fileExists(key) {
    if (!this.enabled) return false;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      return true;
      
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
  
  /**
   * Get file type from filename
   */
  getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) return 'image';
    if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext)) return 'document';
    return 'other';
  }
  
  /**
   * Transform B2 files to media assets format
   */
  async transformToMediaAssets(b2Files) {
    const assets = [];
    
    for (const file of b2Files) {
      const url = await this.getPresignedUrl(file.key);
      
      assets.push({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: file.lastModified,
        modifiedAt: file.lastModified,
        uploadDate: file.lastModified,
        url: url,
        thumbnail: file.type === 'image' ? url : null,
        tags: [],
        metadata: {
          bucket: file.bucket,
          key: file.key,
          storageLocation: 'b2',
        },
        compressionStatus: 'completed',
        storageLocation: 'b2',
        folder: file.folder || null, // Include folder information
        fullPath: file.fullPath || file.key, // Include full path
      });
    }
    
    return assets;
  }
  
  /**
   * Get storage statistics
   */
  async getStats() {
    if (!this.enabled) {
      return {
        enabled: false,
        totalFiles: 0,
        totalSize: 0,
      };
    }
    
    try {
      const files = await this.listFiles();
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      return {
        enabled: true,
        bucket: this.bucket,
        totalFiles: files.length,
        totalSize,
        formattedSize: this.formatFileSize(totalSize),
      };
      
    } catch (error) {
      console.error('Error getting B2 stats:', error);
      return {
        enabled: true,
        error: error.message,
      };
    }
  }
  
  /**
   * Extract folder path from file key, relative to the given prefix
   */
  extractFolderFromKey(key, prefix = '') {
    // Remove the prefix from the key
    let relativePath = key;
    if (prefix && key.startsWith(prefix)) {
      relativePath = key.substring(prefix.length);
    }
    
    // Get the directory part (everything except the filename)
    const folderPath = path.dirname(relativePath);
    
    // If it's in the root (dirname returns '.'), return null
    if (folderPath === '.' || folderPath === '') {
      return null;
    }
    
    // Convert backslashes to forward slashes and normalize
    return folderPath.replace(/\\/g, '/').replace(/^\/+/, '');
  }
  
  /**
   * Get parent folder path for a given folder
   */
  getParentFolder(folderPath, prefix = '') {
    // Remove prefix if present
    let relativePath = folderPath;
    if (prefix && folderPath.startsWith(prefix)) {
      relativePath = folderPath.substring(prefix.length);
    }
    
    // Remove leading/trailing slashes
    relativePath = relativePath.replace(/^\/+|\/+$/g, '');
    
    // Get parent directory
    const parentPath = path.dirname(relativePath);
    
    // If it's in the root, return null
    if (parentPath === '.' || parentPath === '') {
      return null;
    }
    
    return parentPath.replace(/\\/g, '/');
  }
  
  /**
   * List files recursively in a specific folder
   */
  async listFilesInFolder(folderPath = '', maxKeys = 1000) {
    if (!this.enabled) return [];
    
    try {
      // Ensure folder path ends with / for proper prefix matching
      const prefix = folderPath ? (folderPath.endsWith('/') ? folderPath : `${folderPath}/`) : '';
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });
      
      const response = await this.s3Client.send(command);
      
      // Only return files that are directly in this folder (not in subfolders)
      const files = (response.Contents || []).filter(obj => {
        const relativePath = obj.Key.substring(prefix.length);
        // File is in this folder if it doesn't contain any more slashes
        return relativePath && !relativePath.includes('/');
      }).map(obj => ({
        id: path.basename(obj.Key),
        name: path.basename(obj.Key).replace(/^\d+-/, ""),
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        type: this.getFileType(obj.Key),
        storageLocation: 'b2',
        bucket: this.bucket,
        isFolder: false,
        fullPath: obj.Key,
        folder: folderPath || null,
      }));
      
      console.log(`📊 Found ${files.length} files in folder: ${folderPath || 'root'}`);
      return files;
      
    } catch (error) {
      console.error('❌ Error listing files in folder:', error);
      return [];
    }
  }
  
  /**
   * Search files recursively across all folders
   */
  async searchFiles(searchQuery, maxKeys = 1000) {
    if (!this.enabled || !searchQuery) return [];
    
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'uploads/', // Only search in uploads
        MaxKeys: maxKeys,
      });
      
      const response = await this.s3Client.send(command);
      const searchLower = searchQuery.toLowerCase();
      
      // Filter files that match the search query
      const files = (response.Contents || [])
        .filter(obj => {
          const filename = path.basename(obj.Key).toLowerCase();
          return filename.includes(searchLower);
        })
        .map(obj => {
          const folderPath = this.extractFolderFromKey(obj.Key, 'uploads/');
          return {
            id: path.basename(obj.Key),
            name: path.basename(obj.Key).replace(/^\d+-/, ""),
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            type: this.getFileType(obj.Key),
            storageLocation: 'b2',
            bucket: this.bucket,
            isFolder: false,
            fullPath: obj.Key,
            folder: folderPath,
          };
        });
      
      console.log(`🔍 Found ${files.length} files matching: ${searchQuery}`);
      return files;
      
    } catch (error) {
      console.error('❌ Error searching files:', error);
      return [];
    }
  }
  

  // List all soft-deleted files in B2 (files where the latest version is a delete marker)

  async listTrashFiles(prefix = '', maxKeys = 1000) {
    if (!this.enabled) return [];
    
    try {
      const command = new ListObjectVersionsCommand({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });
      
      const response = await this.s3Client.send(command);
      const trashItems = [];
      
      const deleteMarkers = response.DeleteMarkers || [];
      const versions = response.Versions || [];
      
      // Find all delete markers that are the latest version (soft-deleted files)
      const latestDeleteMarkers = deleteMarkers.filter(dm => dm.IsLatest === true);
      
      for (const dm of latestDeleteMarkers) {
        // Find the latest actual version of this file to get size/metadata
        const fileVersions = versions.filter(v => v.Key === dm.Key);
        
        // Sort by LastModified descending to get the most recent version
        fileVersions.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
        const activeVersion = fileVersions[0];
        
        trashItems.push({
          id: path.basename(dm.Key),
          name: path.basename(dm.Key).replace(/^\d+-/, ""),
          key: dm.Key,
          size: activeVersion ? activeVersion.Size : 0,
          lastModified: activeVersion ? activeVersion.LastModified : dm.LastModified,
          deletedAt: dm.LastModified,
          type: this.getFileType(dm.Key),
          storageLocation: 'b2',
          bucket: this.bucket,
          isFolder: false,
          fullPath: dm.Key,
          deleteMarkerVersionId: dm.VersionId,
        });
      }
      return trashItems;
      
    } catch (error) {
      console.error('Error listing trash files from B2:', error);
      throw error;
    }
  }

  // Restore a soft-deleted file by deleting its latest Delete Marker
  async restoreFile(key) {
    if (!this.enabled) {
      throw new Error('B2 Storage is not configured');
    }
    
    try {
      const command = new ListObjectVersionsCommand({
        Bucket: this.bucket,
        Prefix: key,
      });
      
      const response = await this.s3Client.send(command);
      const deleteMarkers = response.DeleteMarkers || [];
      
      // Find the latest delete marker for this key
      const activeDM = deleteMarkers.find(dm => dm.Key === key && dm.IsLatest === true);
      
      if (!activeDM) {
        throw new Error(`No active delete marker found for file: ${key}`);
      }
      
      // Delete the active delete marker version to restore the file
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
        VersionId: activeDM.VersionId,
      });
      
      await this.s3Client.send(deleteCommand);
      return true;
      
    } catch (error) {
      console.error('Error restoring file from B2 Trash:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a file and all of its versions/delete markers
   */
  async permanentlyDeleteFile(key) {
    if (!this.enabled) {
      throw new Error('B2 Storage is not configured');
    }
    
    try {
      const listCommand = new ListObjectVersionsCommand({
        Bucket: this.bucket,
        Prefix: key,
      });
      
      const response = await this.s3Client.send(listCommand);
      const objectsToDelete = [];
      
      if (response.Versions) {
        for (const version of response.Versions) {
          if (version.Key === key) {
            objectsToDelete.push({ Key: key, VersionId: version.VersionId });
          }
        }
      }
      
      if (response.DeleteMarkers) {
        for (const marker of response.DeleteMarkers) {
          if (marker.Key === key) {
            objectsToDelete.push({ Key: key, VersionId: marker.VersionId });
          }
        }
      }
      
      if (objectsToDelete.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true
          }
        });
        await this.s3Client.send(deleteCommand);
      } else {
        // Fallback to standard delete if no versions are found
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
        await this.s3Client.send(command);
      }
      
      return true;
      
    } catch (error) {
      console.error('Error permanently deleting file from B2:', error);
      throw error;
    }
  }
  
  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = B2StorageService;