const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

// Try multiple paths to find Prisma client
let PrismaClient;
let prisma;

try {
  // Try the package path first
  PrismaClient = require(path.join(__dirname, '../../../packages/@noah/db/node_modules/@prisma/client')).PrismaClient;
  console.log('✅ Loaded Prisma from packages/@noah/db');
} catch (e1) {
  try {
    // Try the standard @prisma/client import
    PrismaClient = require('@prisma/client').PrismaClient;
    console.log('✅ Loaded Prisma from @prisma/client');
  } catch (e2) {
    try {
      // Try local node_modules
      PrismaClient = require(path.join(__dirname, '../node_modules/@prisma/client')).PrismaClient;
      console.log('✅ Loaded Prisma from local node_modules');
    } catch (e3) {
      console.error('❌ Could not load Prisma client from any location');
      console.error('Tried paths:', [
        path.join(__dirname, '../../../packages/@noah/db/node_modules/@prisma/client'),
        '@prisma/client',
        path.join(__dirname, '../node_modules/@prisma/client')
      ]);
      throw new Error('@prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.');
    }
  }
}

prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

class AuthService {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'development_jwt_secret_change_in_production';
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'development_refresh_secret_change_in_production';
    this.JWT_EXPIRE = process.env.JWT_EXPIRE || '15m';
    this.JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
  }

  /**
   * Create JWT token
   */
  generateToken(payload, isRefresh = false) {
    const secret = isRefresh ? this.JWT_REFRESH_SECRET : this.JWT_SECRET;
    const expiresIn = isRefresh ? this.JWT_REFRESH_EXPIRE : this.JWT_EXPIRE;
    
    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token, isRefresh = false) {
    try {
      const secret = isRefresh ? this.JWT_REFRESH_SECRET : this.JWT_SECRET;
      return jwt.verify(token, secret);
    } catch (error) {
      return null;
    }
  }

  /**
   * Hash password
   */
  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Login user
   */
  async login(email, password) {
    console.log('🔐 Auth service login attempt for:', email);

    try {
      // Find user with organization
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          organization: true
        }
      });

      if (!user) {
        console.log('❌ User not found:', email);
        return { success: false, error: 'Invalid email or password' };
      }

      console.log('✅ User found:', {
        email: user.email,
        status: user.status,
        hasPasswordHash: !!user.passwordHash,
        failedAttempts: user.failedLoginAttempts
      });

      // Check if account is active
      if (user.status !== 'active') {
        return { success: false, error: 'Account is not active' };
      }

      // Check lockout
      if (user.lockoutUntil && new Date() < new Date(user.lockoutUntil)) {
        return { success: false, error: 'Account is temporarily locked' };
      }

      // Verify password
      console.log('🔑 Verifying password...');
      const isValidPassword = await this.comparePassword(password, user.passwordHash);
      console.log('🔑 Password verification result:', isValidPassword);

      if (!isValidPassword) {
        console.log('❌ Password verification failed');
        // Increment failed attempts
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: user.failedLoginAttempts + 1,
            // Lock account after 5 failed attempts
            lockoutUntil: user.failedLoginAttempts >= 4 
              ? new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
              : null
          }
        });
        
        return { success: false, error: 'Invalid email or password' };
      }

      // Reset failed attempts on successful login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null,
          lastLoginAt: new Date()
        }
      });

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        organizationId: user.orgId,
        organizationSlug: user.organization.slug,
        role: user.role
      };

      const accessToken = this.generateToken(tokenPayload);
      const refreshToken = this.generateToken(tokenPayload, true);

      // Create session
      const session = await prisma.userSession.create({
        data: {
          userId: user.id,
          token: accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          ipAddress: null, // Will be set from request
          userAgent: null  // Will be set from request
        }
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug
          }
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error details:', error.message);
      if (error.code) {
        console.error('Error code:', error.code);
      }
      return { success: false, error: 'Login failed' };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = this.verifyToken(refreshToken, true);
      if (!decoded) {
        return { success: false, error: 'Invalid refresh token' };
      }

      // Find session
      const session = await prisma.userSession.findFirst({
        where: {
          refreshToken,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        include: {
          user: {
            include: {
              organization: true
            }
          }
        }
      });

      if (!session) {
        return { success: false, error: 'Session not found or expired' };
      }

      // Generate new access token
      const tokenPayload = {
        userId: session.user.id,
        email: session.user.email,
        organizationId: session.user.orgId,
        organizationSlug: session.user.organization.slug,
        role: session.user.role
      };

      const newAccessToken = this.generateToken(tokenPayload);

      // Update session
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          token: newAccessToken,
          lastActiveAt: new Date()
        }
      });

      return {
        success: true,
        accessToken: newAccessToken
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return { success: false, error: 'Failed to refresh token' };
    }
  }

  /**
   * Logout user
   */
  async logout(token) {
    try {
      // Find and revoke session
      const session = await prisma.userSession.findFirst({
        where: {
          token,
          revokedAt: null
        }
      });

      if (session) {
        await prisma.userSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: 'Logout failed' };
    }
  }

  /**
   * Get current user from token
   */
  async getCurrentUser(token) {
    try {
      // Verify token
      const decoded = this.verifyToken(token);
      if (!decoded) {
        return { success: false, error: 'Invalid token' };
      }

      // Find session
      const session = await prisma.userSession.findFirst({
        where: {
          token,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        include: {
          user: {
            include: {
              organization: true
            }
          }
        }
      });

      if (!session) {
        return { success: false, error: 'Session not found or expired' };
      }

      // Update last active
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() }
      });

      return {
        success: true,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
          organization: {
            id: session.user.organization.id,
            name: session.user.organization.name,
            slug: session.user.organization.slug
          }
        }
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return { success: false, error: 'Failed to get user' };
    }
  }

  /**
   * Middleware to authenticate requests
   */
  authenticateToken() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
          return res.status(401).json({ error: 'Access token required' });
        }

        const userResult = await this.getCurrentUser(token);
        
        if (!userResult.success) {
          return res.status(401).json({ error: userResult.error });
        }

        req.user = userResult.user;
        next();
      } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Authentication failed' });
      }
    };
  }

  /**
   * Create initial admin user if none exists
   */
  async ensureAdminUser() {
    try {
      // Check if any users exist
      const userCount = await prisma.user.count();
      
      if (userCount === 0) {
        console.log('No users found, creating initial admin user...');
        
        // Create Visit Detroit organization
        const org = await prisma.organization.upsert({
          where: { slug: 'visit-detroit' },
          update: {},
          create: {
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

        // Create admin user
        const adminPassword = process.env.ADMIN_PASSWORD || 'VisitDetroit2024!';
        const adminUser = await prisma.user.create({
          data: {
            orgId: org.id,
            email: process.env.ADMIN_EMAIL || 'admin@visitdetroit.com',
            name: 'Admin User',
            passwordHash: await this.hashPassword(adminPassword),
            role: 'admin',
            status: 'active'
          }
        });

        console.log('✅ Created admin user:', adminUser.email);
        console.log('   Password:', adminPassword);

        // Create debug user for development
        if (process.env.ENABLE_DEBUG_LOGIN === 'true') {
          const debugUser = await prisma.user.create({
            data: {
              orgId: org.id,
              email: process.env.DEBUG_EMAIL || 'debug@test.com',
              name: 'Debug User',
              passwordHash: await this.hashPassword(process.env.DEBUG_PASSWORD || 'debug123'),
              role: 'admin',
              status: 'active'
            }
          });
          
          console.log('✅ Created debug user:', debugUser.email);
          console.log('   Password:', process.env.DEBUG_PASSWORD || 'debug123');
        }
      }
    } catch (error) {
      console.error('Error ensuring admin user:', error);
    }
  }
}

module.exports = AuthService;