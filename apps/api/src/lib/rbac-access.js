const { isOrgWideRole, PERMISSIONS } = require('./rbac-policy');

async function loadUserAuthzContext(prisma, userId) {
  if (!prisma || !userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      orgId: true,
      roleId: true,
      status: true,
      roleRelation: {
        select: {
          id: true,
          name: true,
          permissions: {
            select: {
              permission: {
                select: { slug: true },
              },
            },
          },
        },
      },
      projectUsers: {
        select: { projectId: true },
      },
    },
  });

  if (!user || user.status !== 'active') return null;

  const role = user.roleRelation?.name || null;
  let permissions = (user.roleRelation?.permissions || []).map((rp) => rp.permission.slug);

  // Safety fallback for Super Admin / System Admin
  if ((role === 'Super Admin' || role === 'System Admin') && permissions.length === 0) {
    permissions = PERMISSIONS.map((p) => p.slug);
  }

  const allowedProjectIds = user.projectUsers.map((p) => p.projectId);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    orgId: user.orgId,
    roleId: user.roleId,
    role: role,
    permissions: permissions,
    allowedProjectIds: allowedProjectIds,
    isOrgWide: isOrgWideRole(role || user.roleId),
  };
}

function projectScopeWhere(user) {
  if (!user) return { id: '__DENY_ALL__' };

  const orgId = user.orgId;
  const where = {};

  if (orgId) {
    where.orgId = orgId;
  }

  const isOrgWide = isOrgWideRole(user.role || user.roleId);
  if (isOrgWide) {
    return where;
  }

  const allowedProjectIds = user.allowedProjectIds || [];
  where.OR = [
    { ownerType: 'PROJECT', ownerId: { in: allowedProjectIds } },
    { workspaceId: { in: allowedProjectIds } },
  ];

  return where;
}

async function assertAssetAccess(prisma, user, filenameOrId) {
  if (!prisma || !user || !filenameOrId) return false;

  const isOrgWide = isOrgWideRole(user.role || user.roleId);

  const asset = await prisma.asset.findFirst({
    where: {
      OR: [{ id: filenameOrId }, { name: filenameOrId }],
    },
    select: {
      id: true,
      orgId: true,
      ownerType: true,
      ownerId: true,
      workspaceId: true,
    },
  });

  if (!asset) return false;

  if (user.orgId && asset.orgId && asset.orgId !== user.orgId) {
    return false;
  }

  if (isOrgWide) return true;

  const allowedProjectIds = user.allowedProjectIds || [];
  const targetId = asset.ownerType === 'PROJECT' ? asset.ownerId : asset.workspaceId;

  if (targetId && !allowedProjectIds.includes(targetId)) {
    return false;
  }

  return true;
}

module.exports = {
  loadUserAuthzContext,
  projectScopeWhere,
  assertAssetAccess,
};
