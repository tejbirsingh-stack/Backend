const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');

const SALT_ROUNDS = 10;
const SESSION_DAYS = 1;

function serializeAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    status: admin.status,
    lastLoginAt: admin.lastLoginAt,
    lastActiveAt: admin.lastActiveAt,
    createdAt: admin.createdAt,
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(hash, password) {
  return bcrypt.compare(password, hash);
}

async function findAdminByEmail(email) {
  return prisma.platformAdmin.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
}

async function findAdminById(id) {
  return prisma.platformAdmin.findUnique({ where: { id } });
}

async function createSession(adminId, token, ipAddress, userAgent) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.platformSession.create({
    data: {
      adminId,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    },
  });
}

async function revokeSessionByToken(token) {
  return prisma.platformSession.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function findActiveSession(token) {
  return prisma.platformSession.findFirst({
    where: {
      token,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { admin: true },
  });
}

async function recordLoginSuccess(adminId) {
  return prisma.platformAdmin.update({
    where: { id: adminId },
    data: {
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });
}

async function recordLoginFailure(admin) {
  const attempts = (admin.failedLoginAttempts || 0) + 1;
  const data = { failedLoginAttempts: attempts };
  if (attempts >= 5) {
    data.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  return prisma.platformAdmin.update({
    where: { id: admin.id },
    data,
  });
}

async function touchActive(adminId) {
  return prisma.platformAdmin.update({
    where: { id: adminId },
    data: { lastActiveAt: new Date() },
  }).catch(() => null);
}

module.exports = {
  serializeAdmin,
  hashPassword,
  verifyPassword,
  findAdminByEmail,
  findAdminById,
  createSession,
  revokeSessionByToken,
  findActiveSession,
  recordLoginSuccess,
  recordLoginFailure,
  touchActive,
};
