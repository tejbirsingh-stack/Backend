import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify({
  logger: true
});

await fastify.register(cors, {
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001', 
    'http://localhost:3002', 
    'http://localhost:5173',
    'https://noah-web-nine.vercel.app'
  ],
  credentials: true
});

await fastify.register(multipart);

await fastify.register(jwt, {
  secret: 'test-secret-key-for-development'
});

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
  list: true
});

fastify.get('/api/media', async (request, reply) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const assets = files
      .filter(file => !file.startsWith('.'))
      .map(filename => {
        const filepath = path.join(uploadsDir, filename);
        const stats = fs.statSync(filepath);
        const ext = path.extname(filename).toLowerCase();
        
        let type = 'application/octet-stream';
        if (['.mp4', '.webm', '.mov'].includes(ext)) type = 'video/mp4';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) type = 'image/' + ext.slice(1);
        else if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio/' + ext.slice(1);
        else if (['.pdf'].includes(ext)) type = 'application/pdf';
        
        return {
          id: filename,
          name: filename,
          type,
          size: stats.size,
          uploadDate: stats.mtime.toISOString(),
          url: `/uploads/${filename}`,
          thumbnail: type.startsWith('image/') ? `/uploads/${filename}` : null
        };
      });
    
    reply.send({
      data: assets,
      meta: {
        total: assets.length,
        limit: 100,
        offset: 0,
        hasMore: false
      }
    });
  } catch (error) {
    console.error('Error reading uploads:', error);
    reply.code(500).send({ error: 'Failed to fetch media assets' });
  }
});

fastify.post('/api/media/upload', async (request, reply) => {
  try {
    const parts = request.parts();
    const uploadedFiles = [];

    for await (const part of parts) {
      if (part.file) {
        const filename = `${Date.now()}-${part.filename}`;
        const filepath = path.join(uploadsDir, filename);
        
        const writeStream = fs.createWriteStream(filepath);
        await new Promise((resolve, reject) => {
          part.file.pipe(writeStream);
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        const stats = fs.statSync(filepath);
        uploadedFiles.push({
          id: filename,
          name: part.filename,
          type: part.mimetype,
          size: stats.size,
          uploadDate: new Date().toISOString(),
          url: `/uploads/${filename}`,
          thumbnail: part.mimetype.startsWith('image/') ? `/uploads/${filename}` : null
        });
      }
    }

    reply.send({
      success: true,
      message: 'Files uploaded successfully',
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Upload error:', error);
    reply.code(500).send({ error: 'Upload failed' });
  }
});

fastify.delete('/api/media/:id', async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const filepath = path.join(uploadsDir, id);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    
    reply.code(204).send();
  } catch (error) {
    console.error('Delete error:', error);
    reply.code(500).send({ error: 'Delete failed' });
  }
});

// Mock user for testing
const mockUser = {
  id: 'user-123',
  email: 'test@noah.com',
  name: 'Test User',
  role: 'admin',
  orgId: 'org-1'
};

// Auth routes
fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body as any;
  
  console.log('Login attempt:', { email });
  
  // Accept any credentials for testing
  const token = fastify.jwt.sign({
    id: mockUser.id,
    email: email || mockUser.email,
    role: mockUser.role
  });
  
  reply.send({
    user: {
      ...mockUser,
      email: email || mockUser.email
    },
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
});

fastify.post('/api/auth/register', async (request, reply) => {
  const { name, email, password, orgId } = request.body as any;
  
  console.log('Register attempt:', { name, email });
  
  const token = fastify.jwt.sign({
    id: 'user-' + Date.now(),
    email,
    role: 'user'
  });
  
  reply.send({
    user: {
      id: 'user-' + Date.now(),
      name,
      email,
      role: 'user',
      orgId: orgId || 'org-1'
    },
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
});

fastify.get('/api/auth/me', async (request, reply) => {
  reply.send({ user: mockUser });
});

fastify.post('/api/auth/logout', async (request, reply) => {
  reply.send({ success: true });
});

fastify.post('/api/auth/reset-password', async (request, reply) => {
  const { email } = request.body as any;
  console.log('Password reset requested for:', email);
  reply.send({ success: true, message: 'Password reset email sent' });
});

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    const port = process.env.PORT || 4000;
    await fastify.listen({ port: Number(port), host: '0.0.0.0' });
    console.log(`Simple API server running on http://localhost:${port}`);
    console.log('Uploads directory:', uploadsDir);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();