const platformAuthService = require('../services/platform-auth.service');
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

    const admin = await platformAuthService.findAdminByEmail(email);
    if (!admin) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid platform credentials',
        statusCode: 401,
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
      request.ip,
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

module.exports = {
  platformLogin,
  platformMe,
  platformLogout,
};
