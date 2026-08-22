const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');
const {
  resolveRole,
  sendUserInviteEmail,
  authService,
} = require('../lib/platform-provision');

async function listUsers(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();
    const status = request.query?.status ? String(request.query.status) : undefined;
    const orgId = request.query?.orgId ? String(request.query.orgId) : undefined;
    const take = Math.min(parseInt(request.query?.limit || '50', 10) || 50, 200);
    const skip = parseInt(request.query?.offset || '0', 10) || 0;

    const where = {
      ...(status ? { status } : {}),
      ...(orgId ? { orgId } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          lastLoginAt: true,
          lastActiveAt: true,
          createdAt: true,
          jobTitle: true,
          mfaEnabled: true,
          roleRelation: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true, slug: true, status: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { success: true, total, users: items };
  } catch (error) {
    console.error('listUsers error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list users',
      statusCode: 500,
    });
  }
}

async function inviteUser(request, reply) {
  try {
    const body = request.body || {};
    const email = String(body.email || '')
      .toLowerCase()
      .trim();
    const orgId = body.orgId ? String(body.orgId).trim() : '';
    const roleIdOrName = body.roleId || body.role || body.roleName;
    const name = body.name ? String(body.name).trim() : '';

    if (!email || !orgId || !roleIdOrName) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'email, orgId, and roleId are required',
        statusCode: 400,
      });
    }

    const emailValidation = await authService.validateBusinessEmail(email);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: emailValidation.message,
        statusCode: 400,
      });
    }

    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'User with this email is already registered',
        statusCode: 409,
      });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { currentPlan: true },
    });
    if (!organization) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Organization not found',
        statusCode: 400,
      });
    }

    const maxUsers = organization.currentPlan?.maxUsers ?? organization.maxUsers ?? 10;
    const currentUsersCount = await prisma.user.count({ where: { orgId } });
    if (currentUsersCount >= maxUsers) {
      return reply.status(403).send({
        error: 'SeatLimitReached',
        message: 'Member seat limit reached. Upgrade the plan to add more members.',
        statusCode: 403,
      });
    }

    const roleObj = await resolveRole(prisma, roleIdOrName);
    if (!roleObj) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Role not found',
        statusCode: 400,
      });
    }

    if (roleObj.name === 'Platform Admin') {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Platform Admin cannot be assigned via platform invite',
        statusCode: 400,
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        roleId: roleObj.id,
        orgId,
        status: 'inactive',
        mfaEnabled: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        orgId: true,
        roleRelation: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    const defaultWorkspace = await prisma.workspace.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
    if (defaultWorkspace) {
      await prisma.workspaceUser.create({
        data: {
          workspaceId: defaultWorkspace.id,
          userId: user.id,
        },
      });
    }

    try {
      await sendUserInviteEmail({
        request,
        user,
        roleName: roleObj.name,
      });
    } catch (emailErr) {
      console.warn('[platform] Failed to send user invite email:', emailErr.message);
    }

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.USER_INVITED,
      description: `Invited ${email} to ${organization.name} as ${roleObj.name}`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId,
    });

    return reply.status(201).send({
      success: true,
      message: 'User invited successfully',
      user,
    });
  } catch (error) {
    console.error('inviteUser error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to invite user',
      statusCode: 500,
    });
  }
}

async function listRoles(request, reply) {
  try {
    const includePlatformAdmin = request.query?.includePlatformAdmin === 'true';

    const where = includePlatformAdmin ? {} : { name: { not: 'Platform Admin' } };

    const roles = await prisma.role.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, show: true },
    });

    return { success: true, roles };
  } catch (error) {
    console.error('listRoles error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list roles',
      statusCode: 500,
    });
  }
}

async function patchUser(request, reply) {
  try {
    const { userId } = request.params;
    const body = request.body || {};
    const data = {};

    if (body.status !== undefined) {
      if (!['active', 'inactive', 'suspended'].includes(body.status)) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'status must be active, inactive, or suspended',
          statusCode: 400,
        });
      }
      data.status = body.status;
    }
    if (body.name !== undefined) data.name = String(body.name).trim() || null;

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        orgId: true,
        roleRelation: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.USER_UPDATED,
      description: `Updated user ${user.email} (${user.status})`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: user.orgId,
    });

    return { success: true, user };
  } catch (error) {
    console.error('patchUser error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update user',
      statusCode: 500,
    });
  }
}

async function listWorkspaces(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();
    const orgId = request.query?.orgId ? String(request.query.orgId) : undefined;
    const take = Math.min(parseInt(request.query?.limit || '50', 10) || 50, 200);
    const skip = parseInt(request.query?.offset || '0', 10) || 0;

    const where = {
      ...(orgId ? { orgId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          organization: { select: { id: true, name: true, slug: true, status: true } },
          _count: { select: { folders: true, projects: true, users: true, assets: true } },
        },
      }),
      prisma.workspace.count({ where }),
    ]);

    return { success: true, total, workspaces: items };
  } catch (error) {
    console.error('listWorkspaces error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list workspaces',
      statusCode: 500,
    });
  }
}

module.exports = {
  listUsers,
  inviteUser,
  listRoles,
  patchUser,
  listWorkspaces,
};
