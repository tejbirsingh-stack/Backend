const prisma = require('./prisma');

const ACCESS_LEVELS = {
  'Full Access': 3,
  'Can edit': 2,
  'Can view': 1,
};

/**
 * Validates if a user has the required access level for a project.
 * Throws an error if unauthorized (403).
 *
 * @param {string} projectId - The ID of the project
 * @param {string} userId - The ID of the user
 * @param {string} requiredLevel - 'Full Access', 'Can edit', or 'Can view'
 * @param {Object} localPrisma - Optional prisma client
 * @returns {Promise<boolean>} True if authorized
 */
async function verifyProjectAccess(projectId, userId, requiredLevel, localPrisma = prisma) {
  if (!projectId) return true;

  const project = await localPrisma.project.findUnique({
    where: { id: projectId },
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

  // 0. Check system role, project creator & workspace admin
  const requestingUser = await localPrisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true }
  }).catch(() => null);

  if (requestingUser && (requestingUser.systemRole === 'SUPER_ADMIN' || requestingUser.systemRole === 'ADMIN')) {
    highestLevelValue = Math.max(highestLevelValue, ACCESS_LEVELS['Full Access']);
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
  }

  const requiredValue = ACCESS_LEVELS[requiredLevel] || 0;

  if (highestLevelValue < requiredValue) {
    const err = new Error(`Access Denied: Requires '${requiredLevel}' access for this project.`);
    err.statusCode = 403;
    throw err;
  }

  return true;
}

module.exports = {
  verifyProjectAccess,
  ACCESS_LEVELS
};
