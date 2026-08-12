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

module.exports = {
  verifyProjectAccess,
  ACCESS_LEVELS
};
