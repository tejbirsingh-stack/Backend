const ROLE_IDS = {
  SYSTEM_ADMIN: '350c047a-60a1-4a84-8bdb-79748e9a906e',
  ADMIN: '88a6b2a1-b2f6-40d5-8b04-4abf7eb45401',
  EDITOR: '93cdf95e-dd2a-45b7-965d-cab2d1423784',
  SUPER_ADMIN: '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15',
  VIEWER: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
  COLLABORATOR: 'ffeec394-0e40-49e1-aed3-61962118d73e',
};

const PERMISSIONS = [
  { slug: 'view_search_media', name: 'View, Search & Preview Media' },
  { slug: 'download_stream_media', name: 'Stream & Download Media' },
  { slug: 'upload_media', name: 'Upload Media' },
  { slug: 'delete_media', name: 'Hard Delete Media' },
  { slug: 'manage_trash', name: 'Trash & Restore' },
  { slug: 'edit_metadata_tags', name: 'Edit Metadata & Tags' },
  { slug: 'timeline_annotations', name: 'Timeline Annotations' },
  { slug: 'annotation_privacy', name: 'Annotation Privacy Controls' },
  { slug: 'create_share_links', name: 'Create Public Review Links' },
  { slug: 'manage_users_permissions', name: 'Manage Users & Permissions' },
  { slug: 'configure_sso_mfa', name: 'OAuth SSO & MFA Configuration' },
  { slug: 'view_audit_analytics', name: 'Audit & Analytics' },
  { slug: 'manage_root_folders', name: 'Create/Delete Root Folders' },
  { slug: 'manage_subscription_billing', name: 'Subscription & Billing' },
  { slug: 'provision_enterprise_org', name: 'Enterprise Account Provisioning' },
  { slug: 'manage_infrastructure', name: 'Infrastructure / AWS Setup' },
];

const ROLE_PERMISSIONS_MAP = {
  [ROLE_IDS.SUPER_ADMIN]: PERMISSIONS.map((p) => p.slug),
  [ROLE_IDS.ADMIN]: PERMISSIONS.map((p) => p.slug).filter(
    (s) =>
      !['manage_subscription_billing', 'provision_enterprise_org', 'manage_infrastructure'].includes(s)
  ),
  [ROLE_IDS.EDITOR]: [
    'view_search_media',
    'download_stream_media',
    'upload_media',
    'manage_trash',
    'edit_metadata_tags',
    'timeline_annotations',
    'annotation_privacy',
    'create_share_links',
  ],
  [ROLE_IDS.COLLABORATOR]: [
    'view_search_media',
    'download_stream_media',
    'timeline_annotations',
    'annotation_privacy',
  ],
  [ROLE_IDS.VIEWER]: [
    'view_search_media',
    'download_stream_media',
  ],
};

function roleHasPermission(roleId, permissionSlug) {
  const allowed = ROLE_PERMISSIONS_MAP[roleId] || [];
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
    return user.permissions || ROLE_PERMISSIONS_MAP[user.roleId] || [];
  }

  const userId = user.id;
  const workspaceId = workspace.id;

  // 2. Check explicit direct membership
  const directMember = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId },
    select: { accessLevelId: true }
  });

  if (directMember && directMember.accessLevelId) {
    const accessLevelPerms = await prisma.accessLevelPermission.findMany({
      where: { accessLevelId: directMember.accessLevelId },
      include: { permission: true }
    });
    return accessLevelPerms.map(alp => alp.permission.slug);
  }

  // 3. Check explicit group membership
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
    return accessLevelPerms.map(alp => alp.permission.slug);
  }

  // 4. Fallback for Public workspaces
  if (workspace.visibility === 'public') {
    return user.permissions || ROLE_PERMISSIONS_MAP[user.roleId] || [];
  }

  // If private and no explicit access, return empty permissions
  return [];
}

/**
 * Resolves the effective permissions for a user within a specific project.
 * Hierarchy:
 * 1. Project is Private: strictly check project_users / project_groups access levels.
 * 2. Project is Public: fallback to parent Workspace permissions.
 */
async function resolveUserProjectPermissions(prisma, user, project) {
  // 1. Super Admins / Admins retain their full global permissions everywhere
  if (isOrgWideRole(user.role || user.roleId)) {
    return user.permissions || ROLE_PERMISSIONS_MAP[user.roleId] || [];
  }

  const userId = user.id;
  const projectId = project.id;
  
  // If the project is private, we STRICTLY follow project-level permissions
  if (project.visibility === 'private') {
    // Check direct project membership
    const directMember = await prisma.projectUser.findFirst({
      where: { projectId, userId },
      select: { accessLevelId: true }
    });

    if (directMember && directMember.accessLevelId) {
      const accessLevelPerms = await prisma.accessLevelPermission.findMany({
        where: { accessLevelId: directMember.accessLevelId },
        include: { permission: true }
      });
      return accessLevelPerms.map(alp => alp.permission.slug);
    }

    // Check project group membership
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
      return accessLevelPerms.map(alp => alp.permission.slug);
    }

    // If private and no explicit access, return empty permissions
    return [];
  }

  // If the project is public, fall back to the workspace permissions
  let workspace = project.workspace;
  if (!workspace) {
    if (project.workspaceId) {
      workspace = await prisma.workspace.findUnique({ where: { id: project.workspaceId } });
    } else if (project.folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: project.folderId }, include: { workspace: true } });
      workspace = folder?.workspace;
    }
  }

  if (workspace) {
    return resolveUserWorkspacePermissions(prisma, user, workspace);
  }

  // Absolute fallback to global roles if no workspace could be found
  return user.permissions || ROLE_PERMISSIONS_MAP[user.roleId] || [];
}

module.exports = {
  ROLE_IDS,
  PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
  roleHasPermission,
  isOrgWideRole,
  resolveUserWorkspacePermissions,
  resolveUserProjectPermissions,
};
