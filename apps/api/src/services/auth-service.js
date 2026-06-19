// Authentication service with JWT, password hashing, and session management
const argon2 = require("argon2");
const { authenticator } = require("otplib");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Configure authentication options
const AUTH_OPTIONS = {
  // Password hashing options
  argon2: {
    timeCost: 3, // Number of iterations
    memoryCost: 65536, // Memory usage in KiB (64 MB)
    parallelism: 4, // Degree of parallelism
    type: argon2.argon2id, // Use argon2id variant
  },

  // JWT options
  jwt: {
    accessTokenExpiry: "15m", // 15 minutes
    refreshTokenExpiry: "7d", // 7 days
  },

  // Session options
  session: {
    maxActiveSessions: 5, // Max number of active sessions per user
  },

  // MFA options
  mfa: {
    issuer: "Noah Media Platform",
  },
};

// Auth service implementation
class AuthService {
  // Verify a password against a stored hash
  async verifyPassword(hashedPassword, plainPassword) {
    try {
      return await argon2.verify(
        hashedPassword,
        plainPassword,
        AUTH_OPTIONS.argon2
      );
    } catch (error) {
      console.error("Password verification error:", error);
      return false;
    }
  }

  // Hash a password for storage
  async hashPassword(password) {
    try {
      return await argon2.hash(password, AUTH_OPTIONS.argon2);
    } catch (error) {
      console.error("Password hashing error:", error);
      throw new Error("Failed to hash password");
    }
  }

  // Generate a new TOTP secret for MFA
  generateTotpSecret() {
    return authenticator.generateSecret();
  }

  // Verify a TOTP token
  verifyTotp(token, secret) {
    try {
      return authenticator.verify({ token, secret });
    } catch (error) {
      console.error("TOTP verification error:", error);
      return false;
    }
  }

  // Generate a TOTP URI for QR code generation
  generateTotpUri(email, secret) {
    return authenticator.keyuri(email, AUTH_OPTIONS.mfa.issuer, secret);
  }

  // Find a user by email
  async findUserByEmail(email) {
    return await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        orgId: true,
        role: true,
        mfaSecret: true,
        mfaEnabled: true,
        status: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
    });
  }

  // Find a user by ID
  async findUserById(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        orgId: true,
        role: true,
        status: true,
      },
    });
  }

  // Create a new session for a user
  async createSession(userId, userAgent, ipAddress) {
    // 1. Clean up expired sessions for this user
    await prisma.userSession.deleteMany({
      where: {
        userId,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    // 2. Enforce max active sessions limit
    const activeSessions = await prisma.userSession.findMany({
      where: {
        userId,
      },
      orderBy: {
        lastActiveAt: 'asc', // oldest first
      },
      select: { id: true },
    });

    if (activeSessions.length >= AUTH_OPTIONS.session.maxActiveSessions) {
      // Calculate how many to delete to make room for the new one
      const numToDelete = activeSessions.length - AUTH_OPTIONS.session.maxActiveSessions + 1;
      const sessionIdsToDelete = activeSessions.slice(0, numToDelete).map(s => s.id);

      await prisma.userSession.deleteMany({
        where: {
          id: {
            in: sessionIdsToDelete,
          },
        },
      });
    }

    // Generate a random token
    const token = crypto.randomBytes(64).toString("hex");

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    // Create session in database
    const session = await prisma.userSession.create({
      data: {
        userId,
        token,
        userAgent: userAgent || "Unknown",
        ipAddress: ipAddress || "Unknown",
        expiresAt,
        lastActiveAt: new Date(),
      },
    });

    return {
      token,
      expiresAt,
      sessionId: session.id,
    };
  }

  // Validate a session token
  async validateSession(token) {
    if (!token) return null;

    const session = await prisma.userSession.findFirst({
      where: {
        token,
        expiresAt: {
          gt: new Date(), // Not expired
        },
        revokedAt: null, // Not revoked
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            orgId: true,
            role: true,
            status: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          },
        },
      },
    });

    if (!session) return null;

    // Update last active timestamp
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });

    return session;
  }

  // Revoke a session
  async revokeSession(token) {
    await prisma.userSession.updateMany({
      where: { token },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  // Revoke all sessions for a user
  async revokeAllSessions(userId) {
    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  // Alias for revokeAllSessions for better readability in routes
  async revokeAllUserSessions(userId) {
    return this.revokeAllSessions(userId);
  }

  // Create a password reset token
  async createPasswordResetToken(userId) {
    // Generate a random token
    const token = crypto.randomBytes(64).toString("hex");

    // Set expiry to 1 hour from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Store the token in the database
    await prisma.passwordResetToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  // Verify a password reset token and return the associated user ID
  async verifyPasswordResetToken(token) {
    // Find a valid token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        expiresAt: {
          gt: new Date(), // Not expired
        },
        usedAt: null, // Not used yet
      },
    });

    if (!resetToken) {
      return null;
    }

    // Mark the token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    return resetToken.userId;
  }

  // Health check method to verify auth service functionality
  async healthCheck() {
    try {
      // Simple test to verify database connection
      const count = await prisma.user.count();
      return true;
    } catch (error) {
      console.error("Auth service health check failed:", error);
      return false;
    }
  }
}

// Create an instance of the auth service
const authService = new AuthService();

module.exports = authService;
