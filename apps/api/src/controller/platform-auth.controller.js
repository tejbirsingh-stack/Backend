const platformAuthService = require('../services/platform-auth.service');
const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');

/**
 * Checks if client IP is authorized under IP restriction rules.
 * Supports exact IPs, wildcard subnets (e.g. 192.168.1.*), IPv4-mapped IPv6, and CIDR subnets.
 */
function isClientIpAllowed(clientIp, allowedIpsInput) {
  if (!allowedIpsInput || typeof allowedIpsInput !== 'string') return true;
  const cleanedInput = allowedIpsInput.trim();
  if (!cleanedInput || cleanedInput === '*') return true;

  let ip = (clientIp || '').trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  const allowedList = cleanedInput
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedList.length === 0 || allowedList.includes('*')) return true;

  for (const entry of allowedList) {
    let target = entry.trim();
    if (target.startsWith('::ffff:')) {
      target = target.substring(7);
    }
    if (target === ip || target === '*') return true;

    // Wildcard matching (e.g. 192.168.1.* or 10.0.*.*)
    if (target.includes('*')) {
      const regexPattern = '^' + target.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      if (new RegExp(regexPattern).test(ip)) {
        return true;
      }
    }
  }

  return false;
}

async function platformLogin(request, reply) {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    const mfaCode = request.body?.mfaCode ? String(request.body.mfaCode).trim() : null;

    if (!email || !password) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Email and password are required',
        statusCode: 400,
      });
    }

    const clientIp = request.headers['x-forwarded-for']
      ? String(request.headers['x-forwarded-for']).split(',')[0].trim()
      : request.ip;

    // Fetch Global Admin Security Settings
    const globalSettings = await prisma.globalAdminSetting.findFirst().catch(() => null);

    const admin = await platformAuthService.findAdminByEmail(email);
    if (!admin) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid platform credentials',
        statusCode: 401,
      });
    }

    // IP Restriction Validation
    const globalIpEnabled = Boolean(globalSettings?.platformIpRestrictionEnabled);
    const globalAllowedIps = globalSettings?.platformAllowedIps || '';
    const effectiveAllowedIps = admin.allowedIps || globalAllowedIps;
    const ipCheckRequired = globalIpEnabled || Boolean(admin.allowedIps);

    if (ipCheckRequired && !isClientIpAllowed(clientIp, effectiveAllowedIps)) {
      await writePlatformAudit({
        activityName: ACTIVITY_NAME.PLATFORM_ADMIN_LOGIN,
        description: `Blocked platform admin login for ${admin.email} from unauthorized IP ${clientIp}`,
        activityType: ACTIVITY_TYPE.WARNING,
        admin,
      }).catch(() => null);

      return reply.status(403).send({
        error: 'Forbidden',
        message: `Access denied: IP address (${clientIp}) is not authorized for Platform Admin login`,
        statusCode: 403,
      });
    }

    if (admin.lockoutUntil && new Date(admin.lockoutUntil) > new Date()) {
      return reply.status(423).send({
        error: 'Locked',
        message: 'Account temporarily locked. Try again later.',
        statusCode: 423,
      });
    }

    if (admin.status !== 'active') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Platform admin account is not active',
        statusCode: 403,
      });
    }

    const valid = await platformAuthService.verifyPassword(admin.passwordHash, password);
    if (!valid) {
      await platformAuthService.recordLoginFailure(admin);
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid platform credentials',
        statusCode: 401,
      });
    }

    // MFA Verification Check
    const globalMfaRequired = globalSettings?.platformMfaRequired !== false; // default true
    const isMfaEnforced = globalMfaRequired && admin.mfaEnabled !== false;

    if (isMfaEnforced) {
      if (!mfaCode) {
        // Generate 6-digit OTP code
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        await prisma.platformAdmin.update({
          where: { id: admin.id },
          data: {
            emailOTP: otpCode,
            emailOtpExpiresAt: expiresAt,
          },
        });

        // Send OTP email
        const emailService = request.server.emailService || require('../services/email-service');
        await emailService.sendMfaCode(
          admin.email,
          admin.name || 'Platform Admin',
          otpCode,
          { orgName: 'NOAH Operator Console' }
        ).catch((err) => console.error('Failed to send Platform Admin MFA code:', err));

        return reply.status(200).send({
          success: true,
          error: null,
          message: 'An authentication code has been sent to your email',
          requiresMfa: true,
          mfaType: 'email',
          statusCode: 200,
        });
      }

      // Verify submitted MFA code
      const currentAdmin = await prisma.platformAdmin.findUnique({
        where: { id: admin.id },
        select: { emailOTP: true, emailOtpExpiresAt: true },
      });

      if (
        !currentAdmin?.emailOTP ||
        currentAdmin.emailOTP !== mfaCode ||
        !currentAdmin.emailOtpExpiresAt ||
        new Date() > new Date(currentAdmin.emailOtpExpiresAt)
      ) {
        return reply.status(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or expired authentication code',
          requiresMfa: true,
          statusCode: 401,
        });
      }

      // Clear OTP on successful verification
      await prisma.platformAdmin.update({
        where: { id: admin.id },
        data: {
          emailOTP: null,
          emailOtpExpiresAt: null,
        },
      });
    }

    const payload = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      platformAdmin: true,
      aud: 'noah-platform-admin',
    };

    const token = await reply.jwtSign(payload, { expiresIn: '1d' });
    await platformAuthService.createSession(
      admin.id,
      token,
      clientIp,
      request.headers['user-agent'],
    );
    await platformAuthService.recordLoginSuccess(admin.id);
    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLATFORM_ADMIN_LOGIN,
      description: `${admin.email} signed in to platform console`,
      activityType: ACTIVITY_TYPE.INFO,
      admin,
    });

    return {
      success: true,
      accessToken: token,
      admin: platformAuthService.serializeAdmin(admin),
    };
  } catch (error) {
    console.error('platformLogin error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Platform login failed',
      statusCode: 500,
    });
  }
}

async function platformMe(request) {
  return {
    success: true,
    admin: request.platformAdmin,
  };
}

async function platformLogout(request, reply) {
  try {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token) {
      await platformAuthService.revokeSessionByToken(token);
    }
    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLATFORM_ADMIN_LOGOUT,
      description: `${request.platformAdmin?.email || 'admin'} signed out`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
    });
    return { success: true };
  } catch (error) {
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Logout failed',
      statusCode: 500,
    });
  }
}

async function updatePlatformProfile(request, reply) {
  try {
    const adminId = request.platformAdmin.id;
    const { name, email, currentPassword, newPassword } = request.body || {};

    const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin) {
      return reply.status(404).send({ error: 'NotFound', message: 'Platform Admin not found' });
    }

    const updateData = {};

    if (name !== undefined && typeof name === 'string' && name.trim()) {
      updateData.name = name.trim();
    }

    if (email !== undefined && typeof email === 'string' && email.trim()) {
      const cleanedEmail = email.trim().toLowerCase();
      if (cleanedEmail !== admin.email) {
        const existing = await prisma.platformAdmin.findUnique({ where: { email: cleanedEmail } });
        if (existing) {
          return reply.status(400).send({ error: 'Conflict', message: 'Email is already in use by another admin' });
        }
        updateData.email = cleanedEmail;
      }
    }

    if (newPassword) {
      if (!currentPassword) {
        return reply.status(400).send({ error: 'ValidationError', message: 'Current password is required to set a new password' });
      }
      const valid = await platformAuthService.verifyPassword(admin.passwordHash, currentPassword);
      if (!valid) {
        return reply.status(400).send({ error: 'ValidationError', message: 'Incorrect current password' });
      }
      if (newPassword.length < 8) {
        return reply.status(400).send({ error: 'ValidationError', message: 'New password must be at least 8 characters' });
      }
      updateData.passwordHash = await platformAuthService.hashPassword(newPassword);
    }

    const updatedAdmin = await prisma.platformAdmin.update({
      where: { id: adminId },
      data: updateData,
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLATFORM_ADMIN_LOGIN,
      description: `Platform admin ${updatedAdmin.email} updated profile settings`,
      activityType: ACTIVITY_TYPE.UPDATE,
      admin: updatedAdmin,
    }).catch(() => null);

    return reply.send({
      success: true,
      message: 'Profile updated successfully',
      admin: platformAuthService.serializeAdmin(updatedAdmin),
    });
  } catch (err) {
    console.error('Error updating platform admin profile:', err);
    return reply.status(500).send({ error: 'InternalError', message: 'Failed to update profile' });
  }
}

module.exports = {
  platformLogin,
  platformMe,
  platformLogout,
  updatePlatformProfile,
};
