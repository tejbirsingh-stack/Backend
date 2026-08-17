// Authentication service with JWT, password hashing, and session management
// const argon2 = require("argon2");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { loadUserAuthzContext } = require("../lib/rbac-access");
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

  // Validate password rules (min 8 chars, max 255 chars, uppercase, lowercase, number)
  validatePassword(password) {
    if (!password || typeof password !== "string") {
      return { isValid: false, message: "Password is required." };
    }
    const trimmed = password.trim();
    if (trimmed.length < 8) {
      return { isValid: false, message: "Password must be at least 8 characters long." };
    }
    if (trimmed.length > 255) {
      return { isValid: false, message: "Password cannot exceed 255 characters." };
    }
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordPattern.test(trimmed)) {
      return {
        isValid: false,
        message: "Password must include at least one uppercase letter, one lowercase letter, and a number."
      };
    }
    return { isValid: true };
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
            slug: true,
            status: true,
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

    if (!session || !session.user) return null;

    // Check global session timeout inactivity limit
    try {
      const globalSetting = await prisma.globalAdminSetting.findFirst();
      const timeoutDays = Number(globalSetting?.sessionTimeoutDays) || 30;
      const maxInactivityMs = timeoutDays * 24 * 60 * 60 * 1000;

      if (session.lastActiveAt) {
        const inactiveMs = Date.now() - new Date(session.lastActiveAt).getTime();
        if (inactiveMs > maxInactivityMs) {
          // Revoke all sessions for this user due to inactivity timeout
          await this.revokeAllSessions(session.user.id);
          return null;
        }
      }
    } catch (err) {
      console.error("Error checking session inactivity timeout:", err.message);
    }

    const authz = await loadUserAuthzContext(prisma, session.user.id);
    if (authz) {
      session.user.role = authz.role || session.user.roleRelation?.name || 'User';
      session.user.permissions = authz.permissions;
      session.user.allowedProjectIds = authz.allowedProjectIds;
      session.user.isOrgWide = authz.isOrgWide;
    } else {
      session.user.permissions = [];
      session.user.allowedProjectIds = [];
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

  // Get secret for Password Reset JWT
  getResetJwtSecret() {
    return process.env.PASSWORD_RESET_JWT_SECRET || process.env.JWT_SECRET || "password-reset-secret-key-noah-prod-2026-secure";
  }

  // Create a password reset token
  async createPasswordResetToken(userId) {
    // Revoke any previous active reset tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Generate cryptographically secure unique jti
    const jti = crypto.randomUUID();

    // Token expiry must be exactly 12 hours
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const secret = this.getResetJwtSecret();
    const token = jwt.sign(
      {
        sub: userId,
        purpose: "password_reset",
        jti: jti,
      },
      secret,
      {
        expiresIn: "12h",
      }
    );

    // Store the jti and token in the database
    await prisma.passwordResetToken.create({
      data: {
        userId,
        jti,
        token,
        expiresAt,
      },
    });

    return token;
  }

  // Validate password reset token (signature, expiry, purpose, sub, user, jti, used_at, revoked_at)
  async validatePasswordResetToken(token) {
    if (!token || typeof token !== "string") return null;

    const secret = this.getResetJwtSecret();
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      console.warn("JWT reset token verification failed:", err.message);
      return null;
    }

    if (!decoded || decoded.purpose !== "password_reset" || !decoded.sub || !decoded.jti) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) return null;

    const resetTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { jti: decoded.jti },
    });

    if (!resetTokenRecord) return null;
    if (resetTokenRecord.userId !== decoded.sub) return null;
    if (resetTokenRecord.usedAt !== null) return null;
    if (resetTokenRecord.revokedAt !== null) return null;
    if (new Date(resetTokenRecord.expiresAt) <= new Date()) return null;

    return { user, resetTokenRecord, decoded, userId: user.id };
  }

  // Verify a password reset token and return the associated user ID
  async verifyPasswordResetToken(token) {
    const result = await this.validatePasswordResetToken(token);
    return result ? result.userId : null;
  }

  // Reset user password with DB transaction ensuring password update and token invalidation
  async resetUserPassword(token, newPassword) {
    const validation = await this.validatePasswordResetToken(token);
    if (!validation) {
      throw new Error("This password reset link is invalid or has expired. Please request a new reset link.");
    }

    const { user, resetTokenRecord } = validation;

    const passCheck = this.validatePassword(newPassword);
    if (!passCheck.isValid) {
      throw new Error(passCheck.message);
    }

    const passwordHash = await this.hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: "active",
          emailVerified: true,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetTokenRecord.id },
        data: {
          usedAt: new Date(),
        },
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          id: { not: resetTokenRecord.id },
          usedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    await this.revokeAllUserSessions(user.id);

    return { success: true, user };
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
