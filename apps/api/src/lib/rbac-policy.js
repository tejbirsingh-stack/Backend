const ROLE_IDS = {
  SYSTEM_ADMIN: '350c047a-60a1-4a84-8bdb-79748e9a906e',
  ADMIN: '88a6b2a1-b2f6-40d5-8b04-4abf7eb45401',
  EDITOR: '93cdf95e-dd2a-45b7-965d-cab2d1423784',
  SUPER_ADMIN: '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15',
  VIEWER: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
  COLLABORATOR: 'ffeec394-0e40-49e1-aed3-61962118d73e',
};

/**
 * Fetches the global org-role permissions dynamically from the database.
 */
async function getRolePermissions(prisma, roleId) {
  if (!roleId) return [];
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: true }
  });
  return rolePerms.map(rp => rp.permission.slug);
}

async function roleHasPermission(prisma, roleId, permissionSlug) {
  const allowed = await getRolePermissions(prisma, roleId);
  return allowed.includes(permissionSlug);
}

function isOrgWideRole(roleOrId) {
  const orgWideRoles = ['Super Admin', 'Admin', ROLE_IDS.SUPER_ADMIN, ROLE_IDS.ADMIN, ROLE_IDS.SYSTEM_ADMIN];
  return orgWideRoles.includes(roleOrId);
}

/**
 * Resolves the effective permissions for a user within a specific workspace.
 * Uses a hybrid approach: explicitly granted access level permissions (if any) or
 * falls back to global org role permissions for public workspaces.
 */
async function resolveUserWorkspacePermissions(prisma, user, workspace) {
  // 1. Super Admins / Admins retain their full global permissions everywhere
  if (isOrgWideRole(user.role || user.roleId)) {
    return user.permissions && user.permissions.length > 0 ? user.permissions : await getRolePermissions(prisma, user.roleId);
  }

  const userId = user.id;
  const workspaceId = workspace.id;
  let explicitPerms = [];

  // 2. Gather explicit direct membership permissions
  const directMember = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId },
    select: { accessLevelId: true }
  });

  if (directMember && directMember.accessLevelId) {
    const accessLevelPerms = await prisma.accessLevelPermission.findMany({
      where: { accessLevelId: directMember.accessLevelId },
      include: { permission: true }
    });
    explicitPerms.push(...accessLevelPerms.map(alp => alp.permission.slug));
  }

  // 3. Gather explicit group membership permissions
  const groupMember = await prisma.workspaceGroup.findFirst({
    where: {
      workspaceId,
      group: { members: { some: { userId } } }
    },
    select: { accessLevelId: true }
  });

  if (groupMember && groupMember.accessLevelId) {
    const accessLevelPerms = await prisma.accessLevelPermission.findMany({
      where: { accessLevelId: groupMember.accessLevelId },
      include: { permission: true }
    });
    explicitPerms.push(...accessLevelPerms.map(alp => alp.permission.slug));
  }

  // If private, STRICTLY return the union of explicit permissions (empty if none)
  if (workspace.visibility === 'private' || workspace.visibility === 'PRIVATE') {
    return [...new Set(explicitPerms)];
  }

  // 4. Fallback for Public workspaces: Union explicit permissions with global org role permissions
  const globalPerms = user.permissions && user.permissions.length > 0 ? user.permissions : await getRolePermissions(prisma, user.roleId);
  return [...new Set([...explicitPerms, ...globalPerms])];
}

/**
 * Resolves the effective permissions for a user within a specific project.
 * Hierarchy:
 * 1. Gather all explicit project-level permissions (direct + group).
 * 2. If Project is Private: strictly return explicit project permissions.
 * 3. If Project is Public: return union of explicit project permissions and parent workspace permissions.
 */
async function resolveUserProjectPermissions(prisma, user, project) {
  // 1. Super Admins / Admins retain their full global permissions everywhere
  if (isOrgWideRole(user.role || user.roleId)) {
    return user.permissions && user.permissions.length > 0 ? user.permissions : await getRolePermissions(prisma, user.roleId);
  }

  const userId = user.id;
  const projectId = project.id;
  let explicitPerms = [];
  
  // Gather explicit direct project membership permissions
  const directMember = await prisma.projectUser.findFirst({
    where: { projectId, userId },
    select: { accessLevelId: true }
  });

  if (directMember && directMember.accessLevelId) {
    const accessLevelPerms = await prisma.accessLevelPermission.findMany({
      where: { accessLevelId: directMember.accessLevelId },
      include: { permission: true }
    });
    explicitPerms.push(...accessLevelPerms.map(alp => alp.permission.slug));
  }

  // Gather explicit project group membership permissions
  const groupMember = await prisma.projectGroup.findFirst({
    where: {
      projectId,
      group: { members: { some: { userId } } }
    },
    select: { accessLevelId: true }
  });

  if (groupMember && groupMember.accessLevelId) {
    const accessLevelPerms = await prisma.accessLevelPermission.findMany({
      where: { accessLevelId: groupMember.accessLevelId },
      include: { permission: true }
    });
    explicitPerms.push(...accessLevelPerms.map(alp => alp.permission.slug));
  }

  // If the project is private, STRICTLY return the union of explicit project permissions
  if (project.visibility === 'private' || project.visibility === 'PRIVATE') {
    return [...new Set(explicitPerms)];
  }

  // If the project is public, fall back to the workspace permissions AND union with explicit project permissions
  let workspace = project.workspace;
  if (!workspace) {
    if (project.workspaceId) {
      workspace = await prisma.workspace.findUnique({ where: { id: project.workspaceId } });
    } else if (project.folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: project.folderId }, include: { workspace: true } });
      workspace = folder?.workspace;
    }
  }

  let workspacePerms = [];
  if (workspace) {
    workspacePerms = await resolveUserWorkspacePermissions(prisma, user, workspace);
  } else {
    workspacePerms = user.permissions && user.permissions.length > 0 ? user.permissions : await getRolePermissions(prisma, user.roleId);
  }

  return [...new Set([...explicitPerms, ...workspacePerms])];
}

module.exports = {
  ROLE_IDS,
  roleHasPermission,
  isOrgWideRole,
  resolveUserWorkspacePermissions,
  resolveUserProjectPermissions,
  getRolePermissions,
};
