const prisma = require('../utils/prisma');

async function writePlatformAudit({
  activityName,
  description,
  activityType,
  admin,
  orgId = null,
  error = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        activityName,
        description: description || null,
        activityType: activityType || 'platform',
        actorType: 'platform_admin',
        userName: admin?.name || 'Platform Admin',
        userEmail: admin?.email || null,
        userRole: 'Platform Admin',
        userId: null,
        orgId: orgId || null,
        error: error || null,
      },
    });
  } catch (err) {
    console.error('Platform audit write failed:', err.message);
  }
}

module.exports = { writePlatformAudit };
