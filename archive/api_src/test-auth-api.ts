import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';

const fastify = Fastify({ logger: true });

// Register plugins
await fastify.register(cors, {
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
});

await fastify.register(jwt, {
  secret: 'test-secret-key-for-development'
});

// Mock user database
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
  
  console.log('Login attempt:', { email, password });
  
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
  
  console.log('Register attempt:', { name, email, orgId });
  
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
  // Return mock user without auth check
  reply.send({
    user: mockUser
  });
});

fastify.post('/api/auth/logout', async (request, reply) => {
  reply.send({ success: true });
});

fastify.post('/api/auth/reset-password', async (request, reply) => {
  const { email } = request.body as any;
  console.log('Password reset requested for:', email);
  reply.send({ success: true, message: 'Password reset email sent' });
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', service: 'auth-api' };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Test Auth API running on http://localhost:3001');
    console.log('Accepts any login credentials for testing');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();