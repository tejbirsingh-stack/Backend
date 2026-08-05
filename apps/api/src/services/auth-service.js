// Authentication service with JWT, password hashing, and session management
// const argon2 = require("argon2");
const bcrypt = require("bcryptjs");
const { authenticator } = require("otplib");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const dns = require("dns").promises;
let config;
try {
  config = require("../config/index.js").config;
} catch (e) {
  config = process.env;
}

function getExpiryMilliseconds(expiryStr) {
  if (!expiryStr || typeof expiryStr !== "string") return 2 * 60 * 1000;
  const match = expiryStr.match(/^(\d+)([smhd])$/);
  if (!match) return 2 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "s") return value * 1000;
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  return 2 * 60 * 1000;
}

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'zoho.com', 'protonmail.com', 'proton.me', 'mail.com', 'gmx.com',
  'yandex.com', 'mailinator.com', 'tempmail.com', 'guerrillamail.com',
  '10minutemail.com', 'trashmail.com', 'getairmail.com'
]);

// Configure authentication options
const AUTH_OPTIONS = {
  // Password hashing options (bcrypt)
  bcrypt: {
    saltRounds: 10,
  },

  // JWT options
  jwt: {
    accessTokenExpiry: config ? config.JWT_EXPIRES_IN : "1d", // dynamically linked to config
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
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error("Password verification error:", error);
      return false;
    }
  }

  // Hash a password for storage
  async hashPassword(password) {
    try {
      return await bcrypt.hash(password, AUTH_OPTIONS.bcrypt.saltRounds);
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

  // Validate if an email is a real, active business email (Layer 1: free domain check, Layer 2: DNS verification)
  async validateBusinessEmail(email) {
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return { isValid: false, message: "Invalid email address format." };
    }

    const domain = email.split("@")[1].toLowerCase().trim();

    // Layer 1: Check against known public/free email providers
    if (FREE_EMAIL_DOMAINS.has(domain)) {
      return {
        isValid: false,
        message: "Please enter a corporate or work email address (personal emails like Gmail/Outlook are not allowed)."
      };
    }

    // Layer 2: Perform strict DNS check for active Mail Exchange (MX) records
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (mxRecords && mxRecords.length > 0) {
        // Ensure at least one MX record has a valid exchange target
        const validMx = mxRecords.some(r => r && r.exchange && r.exchange !== '.' && r.exchange !== 'localhost');
        if (validMx) {
          return { isValid: true };
        }
      }
    } catch (mxError) {
      // MX lookup failed (e.g. ENODATA when domain exists but has no mail servers, or ENOTFOUND when domain doesn't exist)
    }

    return {
      isValid: false,
      message: `The domain "${domain}" does not have active mail servers (MX records) configured to receive emails.`
    };
  }

  // Find a user by email
  async findUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        orgId: true,
        roleId: true,
        mfaSecret: true,
        mfaEnabled: true,
        status: true,
        emailVerified: true,
        timezone: true,
        avatarUrl: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        roleId: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
    });
    if (user && user.roleRelation && user.roleRelation.name) {
      user.role = user.roleRelation.name;
    }
    return user;
  }

  // Find a user by ID
  async findUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        orgId: true,
        roleId: true,
        status: true,
        emailVerified: true,
        timezone: true,
        avatarUrl: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
    });
    if (user && user.roleRelation && user.roleRelation.name) {
      user.role = user.roleRelation.name;
    }
    return user;
  }

  // Create a new session for a user
  async createSession(userId, userAgent, ipAddress, customToken = null) {
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

    // Use real JWT customToken if provided, otherwise generate fallback random token
    const token = customToken || crypto.randomBytes(64).toString("hex");

    // Calculate expiry dynamically based on centralized config
    const expiresAt = new Date(Date.now() + getExpiryMilliseconds(AUTH_OPTIONS.jwt.accessTokenExpiry));

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
            roleId: true,
            status: true,
            emailVerified: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            },
            roleRelation: {
              select: {
                id: true,
                name: true
              }
            }
          },
        },
      },
    });

    if (!session) return null;

    if (session.user && session.user.roleRelation && session.user.roleRelation.name) {
      session.user.role = session.user.roleRelation.name;
    }

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

  // Create an email verification token
  async createEmailVerificationToken(userId) {
    const token = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

    await prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  // Verify an email verification token and mark user's emailVerified as true
  async verifyEmailVerificationToken(token) {
    if (!token || typeof token !== "string") return null;

    const verificationToken = await prisma.emailVerificationToken.findFirst({
      where: {
        token,
      },
    });

    if (!verificationToken || verificationToken.usedAt !== null || new Date() > verificationToken.expiresAt) {
      return null;
    }

    // Mark token as used
    await prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    });

    // Update user's emailVerified to true
    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true },
    });

    return verificationToken.userId;
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
