import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function filesRoutes(fastify, options) {
  // Get directory structure
  fastify.get('/directory', async (request, reply) => {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      const getDirectoryStructure = async (dir, basePath = '') => {
        const items = [];
        
        try {
          const files = await fs.readdir(dir, { withFileTypes: true });
          
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
              const stats = await fs.stat(fullPath);
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

      // Check if uploads directory exists
      try {
        await fs.access(uploadsDir);
      } catch {
        // Create uploads directory if it doesn't exist
        await fs.mkdir(uploadsDir, { recursive: true });
      }

      const directories = await getDirectoryStructure(uploadsDir);
      
      // If no directories found, return demo structure
      if (directories.length === 0) {
        return {
          directories: [
            {
              name: 'Sample Project',
              type: 'folder',
              path: '/Sample Project',
              children: [
                {
                  name: 'Videos',
                  type: 'folder',
                  path: '/Sample Project/Videos',
                  children: []
                },
                {
                  name: 'Images',
                  type: 'folder',
                  path: '/Sample Project/Images',
                  children: []
                }
              ]
            }
          ]
        };
      }
      
      return { directories };
    } catch (error) {
      console.error('Error getting directory structure:', error);
      return reply.code(500).send({ 
        error: 'Failed to get directory structure',
        message: error.message 
      });
    }
  });

  // Create new folder
  fastify.post('/folder', async (request, reply) => {
    try {
      const { name, parentPath = '' } = request.body;
      
      if (!name) {
        return reply.code(400).send({ error: 'Folder name is required' });
      }
      
      const uploadsDir = path.join(__dirname, '../../uploads');
      const folderPath = path.join(uploadsDir, parentPath, name);
      
      await fs.mkdir(folderPath, { recursive: true });
      
      return { 
        success: true, 
        message: 'Folder created successfully',
        path: path.join(parentPath, name).replace(/\\/g, '/')
      };
    } catch (error) {
      console.error('Error creating folder:', error);
      return reply.code(500).send({ 
        error: 'Failed to create folder',
        message: error.message 
      });
    }
  });

  // Delete file or folder
  fastify.delete('/delete', async (request, reply) => {
    try {
      const { path: itemPath, type } = request.body;
      
      if (!itemPath) {
        return reply.code(400).send({ error: 'Path is required' });
      }
      
      const uploadsDir = path.join(__dirname, '../../uploads');
      const fullPath = path.join(uploadsDir, itemPath);
      
      // Check if path exists
      try {
        await fs.access(fullPath);
      } catch {
        return reply.code(404).send({ error: 'File or folder not found' });
      }
      
      if (type === 'folder') {
        await fs.rmdir(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }
      
      return { 
        success: true, 
        message: `${type === 'folder' ? 'Folder' : 'File'} deleted successfully` 
      };
    } catch (error) {
      console.error('Error deleting item:', error);
      return reply.code(500).send({ 
        error: 'Failed to delete item',
        message: error.message 
      });
    }
  });

  // Get recent files
  fastify.get('/recent', async (request, reply) => {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const recentFiles = [];
      
      const getAllFiles = async (dir, basePath = '') => {
        try {
          const files = await fs.readdir(dir, { withFileTypes: true });
          
          for (const file of files) {
            const fullPath = path.join(dir, file.name);
            const relativePath = path.join(basePath, file.name);
            
            if (file.isDirectory()) {
              await getAllFiles(fullPath, relativePath);
            } else {
              const stats = await fs.stat(fullPath);
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
      
      await getAllFiles(uploadsDir);
      
      // Sort by modified date and return top 20
      recentFiles.sort((a, b) => b.modified - a.modified);
      
      return { 
        files: recentFiles.slice(0, 20).map(f => ({
          ...f,
          modified: f.modified.toISOString()
        }))
      };
    } catch (error) {
      console.error('Error getting recent files:', error);
      return reply.code(500).send({ 
        error: 'Failed to get recent files',
        message: error.message 
      });
    }
  });
}