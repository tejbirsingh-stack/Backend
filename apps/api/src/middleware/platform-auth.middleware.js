const platformAuthService = require('../services/platform-auth.service');

/**
 * Authenticates Platform Admin JWTs (audience/claim: platformAdmin).
 * Separate from customer `authenticate` middleware — do not mix sessions.
 */
async function requirePlatformAdmin(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token === 'undefined' || token === 'null') {
      throw new Error('Missing or invalid authorization header');
    }

    let decoded = null;
    try {
      if (typeof request.jwtVerify === 'function') {
        decoded = await request.jwtVerify();
      }
    } catch {
      decoded = null;
    }

    if (!decoded || !decoded.platformAdmin || !decoded.id) {
      // Fall back to platform session table
      const session = await platformAuthService.findActiveSession(token);
      if (!session || !session.admin || session.admin.status !== 'active') {
        throw new Error('Platform authentication required');
      }
      request.platformAdmin = platformAuthService.serializeAdmin(session.admin);
      request.platformSession = session;
      platformAuthService.touchActive(session.admin.id);
      return;
    }

    // Revocation check
    const revoked = await request.server.prisma.platformSession.findFirst({
      where: { token, revokedAt: { not: null } },
    });
    if (revoked) {
      throw new Error('Token has been revoked or expired');
    }

    const admin = await platformAuthService.findAdminById(decoded.id);
    if (!admin || admin.status !== 'active') {
      throw new Error('Platform admin account is not active');
    }

    request.platformAdmin = platformAuthService.serializeAdmin(admin);
    platformAuthService.touchActive(admin.id);
  } catch (error) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: error.message || 'Platform authentication required',
      statusCode: 401,
    });
  }
}

module.exports = { requirePlatformAdmin };
