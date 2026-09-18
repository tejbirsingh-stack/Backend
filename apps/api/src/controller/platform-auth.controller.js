const platformAuthService = require('../services/platform-auth.service');
const authService = require('../services/auth-service');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');

async function platformLogin(request, reply) {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');

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

    const admin = await platformAuthService.findAdminByEmail(email);
    if (!admin) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid platform credentials',
        statusCode: 401,
      });
    }

    // Check lockout disabled for testing phase

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

    const payload = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      platformAdmin: true,
      aud: 'noah-platform-admin',
    };

    const token = await reply.jwtSign(payload, { expiresIn: '15m' });
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

async function platformChangePassword(request, reply) {
  try {
    const currentPassword = String(request.body?.currentPassword || '');
    const newPassword = String(request.body?.newPassword || '');
    const confirmPassword = String(request.body?.confirmPassword || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Current password, new password, and confirm password are required',
        statusCode: 400,
      });
    }

    if (newPassword !== confirmPassword) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'New password and confirm password must match',
        statusCode: 400,
      });
    }

    const adminId = request.platformAdmin?.id;
    if (!adminId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401,
      });
    }

    const admin = await platformAuthService.findAdminById(adminId);
    if (!admin || !admin.passwordHash) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Unable to change password for this account',
        statusCode: 400,
      });
    }

    const currentValid = await platformAuthService.verifyPassword(
      admin.passwordHash,
      currentPassword,
    );
    if (!currentValid) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Current password is incorrect',
        statusCode: 400,
      });
    }

    const passwordCheck = authService.validatePassword(newPassword);
    if (!passwordCheck.isValid) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: passwordCheck.message,
        statusCode: 400,
      });
    }

    if (currentPassword === newPassword) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'New password must be different from the current password',
        statusCode: 400,
      });
    }

    const passwordHash = await platformAuthService.hashPassword(newPassword.trim());
    await platformAuthService.updatePassword(admin.id, passwordHash);

    const authHeader = request.headers.authorization || '';
    const currentToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    await platformAuthService.revokeOtherSessions(admin.id, currentToken || null);

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.PLATFORM_ADMIN_PASSWORD_CHANGED,
      description: `${admin.email} changed platform password`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  } catch (error) {
    console.error('platformChangePassword error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to change password',
      statusCode: 500,
    });
  }
}

module.exports = {
  platformLogin,
  platformMe,
  platformLogout,
  platformChangePassword,
};
