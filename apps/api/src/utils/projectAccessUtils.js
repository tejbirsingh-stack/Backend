const prisma = require('./prisma');
const { resolveUserProjectPermissions } = require('../lib/rbac-policy');

const ACCESS_LEVELS = {
  'Full Access': 'manage_root_folders',
  'Can edit': 'upload_media',
  'Can view': 'view_search_media',
};

/**
 * Validates if a user has the required access level for a project.
 * Throws an error if unauthorized (403).
 */
async function verifyProjectAccess(projectId, userId, requiredLevel, localPrisma = prisma) {
  if (!projectId) return true;

  const project = await localPrisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true }
  });

  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  // 1. Check explicit user permissions
  const projectUser = await localPrisma.projectUser.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  // 2. Check group permissions
  const userGroups = await localPrisma.userGroupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = userGroups.map(ug => ug.groupId);

  const projectGroups = await localPrisma.projectGroup.findMany({
    where: { projectId, groupId: { in: groupIds } },
  });

  let highestLevelValue = 0;

  // 0. Check system/org role, project creator & workspace admin
  const requestingUser = await localPrisma.user.findUnique({
    where: { id: userId },
    include: { roleRelation: true }
  }).catch(() => null);

  const roleName = (requestingUser?.roleRelation?.name || requestingUser?.role || requestingUser?.systemRole || '').trim().toLowerCase();

  if (roleName === 'super admin' || roleName === 'superadmin' || roleName === 'admin' || requestingUser?.systemRole === 'SUPER_ADMIN' || requestingUser?.systemRole === 'ADMIN') {
    return true;
  }

  if (project.createdById === userId || project.createdByUserId === userId) {
    highestLevelValue = Math.max(highestLevelValue, ACCESS_LEVELS['Full Access']);
  }

  if (project.workspaceId) {
    const wsUser = await localPrisma.workspaceUser.findFirst({
      where: { workspaceId: project.workspaceId, userId },
    });
    if (wsUser) {
      if (wsUser.role === 'ADMIN' || wsUser.role === 'OWNER' || wsUser.role === 'SUPER_ADMIN') {
        highestLevelValue = Math.max(highestLevelValue, ACCESS_LEVELS['Full Access']);
      }
    }
  }

  // 1. Check explicit user permissions

  if (projectUser) {
    highestLevelValue = Math.max(highestLevelValue, ACCESS_LEVELS[projectUser.accessLevel] || 0);
  }

  for (const pg of projectGroups) {
    highestLevelValue = Math.max(highestLevelValue, ACCESS_LEVELS[pg.accessLevel] || 0);
  }

  // 3. Fallback for public projects within the same workspace
  if (highestLevelValue === 0 && project.visibility === 'public' && project.workspaceId) {
    // If it's public, workspace members get implicit 'Can view' access
    const workspaceMember = await localPrisma.workspaceUser.findFirst({
      where: { workspaceId: project.workspaceId, userId },
    });
    if (workspaceMember) {
      highestLevelValue = Math.max(highestLevelValue, ACCESS_LEVELS['Can view']);
    }
    const user = await localPrisma.user.findUnique({ where: { id: userId }, include: { roleRelation: true } });
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const mockUser = {
      id: user.id,
      role: user.roleRelation?.name,
      roleId: user.roleId,
      permissions: [] // Ideally from authz context, but resolver will fallback
    };

    const perms = await resolveUserProjectPermissions(localPrisma, mockUser, project);

    const requiredSlug = ACCESS_LEVELS[requiredLevel];

    if (requiredSlug && !perms.includes(requiredSlug)) {
      const err = new Error(`Access Denied: Requires '${requiredLevel}' access for this project.`);
      err.statusCode = 403;
      throw err;
    }

    return true;
  }
}

module.exports = {
  verifyProjectAccess,
  ACCESS_LEVELS
};
