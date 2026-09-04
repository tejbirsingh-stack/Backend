const prisma = require('../utils/prisma');

function normalizeCspToJson(cspInput) {
  if (!cspInput) return JSON.stringify(['noahcloud.ai', 'localhost']);
  if (Array.isArray(cspInput)) {
    return JSON.stringify(cspInput.map((d) => String(d).trim()).filter(Boolean));
  }
  if (typeof cspInput === 'string') {
    const trimmed = cspInput.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return JSON.stringify(parsed.map((d) => String(d).trim()).filter(Boolean));
        }
      } catch (e) {}
    }
    const items = trimmed.split(',').map((d) => d.trim()).filter(Boolean);
    return JSON.stringify(items);
  }
  return JSON.stringify(['noahcloud.ai', 'localhost']);
}

async function getOrCreateGlobalSettings() {
  let settings = await prisma.globalAdminSetting.findFirst();
  if (!settings) {
    settings = await prisma.globalAdminSetting.create({
      data: {
        ssoConfigured: false,
        ssoProvider: 'google, microsoft',
        ssoDomain: null,
        sessionTimeoutDays: 30,
        contentSecurityPolicy: JSON.stringify(['noahcloud.ai', 'localhost']),
      },
    });
  }
  return settings;
}

module.exports.getGlobalSecuritySettings = async (request, reply) => {
  try {
    const settings = await getOrCreateGlobalSettings();
    return reply.send({
      success: true,
      settings: {
        ssoConfigured: Boolean(settings.ssoConfigured),
        ssoProvider: settings.ssoProvider || 'google, microsoft',
        ssoDomain: settings.ssoDomain || '',
        sessionTimeoutDays: Number(settings.sessionTimeoutDays) || 30,
        contentSecurityPolicy: settings.contentSecurityPolicy || JSON.stringify(['noahcloud.ai', 'localhost']),
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching global security settings:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to fetch global security settings',
    });
  }
};

module.exports.updateGlobalSecuritySettings = async (request, reply) => {
  try {
    const {
      ssoConfigured,
      ssoProvider,
      ssoDomain,
      sessionTimeoutDays,
      contentSecurityPolicy,
    } = request.body || {};

    let existing = await prisma.globalAdminSetting.findFirst();

    const updateData = {};
    if (typeof ssoConfigured === 'boolean') updateData.ssoConfigured = ssoConfigured;
    if (typeof ssoProvider === 'string') updateData.ssoProvider = ssoProvider;
    if (typeof ssoDomain === 'string') updateData.ssoDomain = ssoDomain;
    if (typeof sessionTimeoutDays === 'number' || !isNaN(Number(sessionTimeoutDays))) {
      updateData.sessionTimeoutDays = parseInt(sessionTimeoutDays, 10);
    }
    if (contentSecurityPolicy !== undefined) {
      updateData.contentSecurityPolicy = normalizeCspToJson(contentSecurityPolicy);
    }

    let updated;
    if (existing) {
      updated = await prisma.globalAdminSetting.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      updated = await prisma.globalAdminSetting.create({
        data: {
          ssoConfigured: Boolean(ssoConfigured),
          ssoProvider: ssoProvider || 'google, microsoft',
          ssoDomain: ssoDomain || null,
          sessionTimeoutDays: parseInt(sessionTimeoutDays || '30', 10),
          contentSecurityPolicy: normalizeCspToJson(contentSecurityPolicy),
        },
      });
    }

    // Immediately revoke sessions that exceed the new timeout limit across all devices
    if (updateData.sessionTimeoutDays) {
      const newTimeoutDays = updateData.sessionTimeoutDays;
      const cutoffDate = new Date(Date.now() - newTimeoutDays * 24 * 60 * 60 * 1000);

      await prisma.userSession.updateMany({
        where: {
          lastActiveAt: { lt: cutoffDate },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }).catch((err) => console.error("Error revoking inactive sessions on timeout update:", err.message));
    }

    return reply.send({
      success: true,
      message: 'Global security settings updated successfully',
      settings: {
        ssoConfigured: Boolean(updated.ssoConfigured),
        ssoProvider: updated.ssoProvider || 'google, microsoft',
        ssoDomain: updated.ssoDomain || '',
        sessionTimeoutDays: Number(updated.sessionTimeoutDays) || 30,
        contentSecurityPolicy: updated.contentSecurityPolicy || JSON.stringify(['noahcloud.ai', 'localhost']),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating global security settings:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to update global security settings',
    });
  }
};
