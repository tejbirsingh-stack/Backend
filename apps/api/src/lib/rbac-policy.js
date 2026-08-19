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
  const isPrivate = workspace.visibility === 'private' || workspace.visibility === 'PRIVATE';
  const isOwnOrg = !workspace.orgId || !user.orgId || workspace.orgId === user.orgId;

  // 1. Super Admins / Admins get full permissions within their own org (for both public and private workspaces)
  if (isOrgWideRole(user.role || user.roleId) && isOwnOrg) {
    return user.permissions && user.permissions.length > 0
      ? user.permissions
      : await getRolePermissions(prisma, user.roleId);
  }

  // Public workspace + same org → ALWAYS use role-based permissions, for every role
  if (!isPrivate && isOwnOrg) {
    return user.permissions && user.permissions.length > 0
      ? user.permissions
      : await getRolePermissions(prisma, user.roleId);
  }

  const userId = user.id;
  const workspaceId = workspace.id;
  let explicitPerms = [];

  // Direct WorkspaceUser membership
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

  // WorkspaceGroup membership
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

  // At this point: cross-org guest (public or private workspace)
  // ONLY return what was explicitly assigned via WorkspaceUser/WorkspaceGroup
  return [...new Set(explicitPerms)];
}

/**
 * Resolves the effective permissions for a user within a specific project.
 * Hierarchy:
 * 1. Gather all explicit project-level permissions (direct + group).
 * 2. If Project is Private: strictly return explicit project permissions.
 * 3. If Project is Public: return union of explicit project permissions and parent workspace permissions.
 */
async function resolveUserProjectPermissions(prisma, user, project) {
  // 1. Super Admins / Admins get full permissions ONLY within their own org.
  //    Cross-org guests must be checked against ProjectUser.accessLevelId.
  const isOwnOrgProject = !project.orgId || !user.orgId || project.orgId === user.orgId;
  if (isOrgWideRole(user.role || user.roleId) && isOwnOrgProject) {
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

/**
 * Resolves the effective permissions for a user for a specific media asset.
 * Hierarchy:
 * 1. Gather all explicit asset-level permissions (direct + group).
 * 2. If Asset is Private: strictly return explicit asset permissions.
 * 3. If Asset is Public: return union of explicit asset permissions and contextual (Project or Workspace) permissions.
 */
async function resolveUserAssetPermissions(prisma, user, asset, projectContext = null) {
  // 1. Super Admins / Admins get full permissions ONLY within their own org.
  //    Cross-org guests must be checked against AssetUser.accessLevelId.
  const isOwnOrgAsset = !asset.orgId || !user.orgId || asset.orgId === user.orgId;
  if (isOrgWideRole(user.role || user.roleId) && isOwnOrgAsset) {
    return user.permissions && user.permissions.length > 0 ? user.permissions : await getRolePermissions(prisma, user.roleId);
  }

  const userId = user.id;
  const assetId = asset.id;
  let explicitPerms = [];

  // Gather explicit direct asset membership permissions
  const directMember = await prisma.assetUser.findFirst({
    where: { assetId, userId },
    select: { accessLevelId: true }
  });

  if (directMember && directMember.accessLevelId) {
    const accessLevelPerms = await prisma.accessLevelPermission.findMany({
      where: { accessLevelId: directMember.accessLevelId },
      include: { permission: true }
    });
    explicitPerms.push(...accessLevelPerms.map(alp => alp.permission.slug));
  }

  // Gather explicit asset group membership permissions
  const groupMember = await prisma.assetGroup.findFirst({
    where: {
      assetId,
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

  // If the asset is private, STRICTLY return the union of explicit asset permissions
  if (asset.visibility === 'private' || asset.visibility === 'PRIVATE') {
    return [...new Set(explicitPerms)];
  }

  // If the asset is public, fall back to the context permissions (Project or Workspace)
  let contextualPerms = [];
  if (projectContext) {
    contextualPerms = await resolveUserProjectPermissions(prisma, user, projectContext);
  } else {
    let workspace = asset.workspace;
    if (!workspace && asset.workspaceId) {
      workspace = await prisma.workspace.findUnique({ where: { id: asset.workspaceId } });
    }

    if (workspace) {
      contextualPerms = await resolveUserWorkspacePermissions(prisma, user, workspace);
    } else {
      contextualPerms = user.permissions && user.permissions.length > 0 ? user.permissions : await getRolePermissions(prisma, user.roleId);
    }
  }

  return [...new Set([...explicitPerms, ...contextualPerms])];
}

module.exports = {
  ROLE_IDS,
  roleHasPermission,
  isOrgWideRole,
  resolveUserWorkspacePermissions,
  resolveUserProjectPermissions,
  resolveUserAssetPermissions,
  getRolePermissions,
};
