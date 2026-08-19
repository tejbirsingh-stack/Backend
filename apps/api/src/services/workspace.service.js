const { isOrgWideRole } = require('../lib/rbac-policy');
const { ACCESS_LEVEL, MEMBER_TYPES } = require('../lib/rolesPermissions');

/**
 * Automatically assigns all Super Admins and Admins in the organization to a given workspace.
 */
async function autoAssignAdminsToWorkspace(prisma, orgId, workspaceId) {
  if (!orgId || !workspaceId) return;

  try {
    const orgAdmins = await prisma.user.findMany({
      where: {
        orgId,
        roleRelation: {
          name: { in: ['Super Admin', 'Admin', 'System Admin'] }
        }
      },
      select: { id: true }
    });

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { visibility: true }
    });

    // If it's a public workspace, there's no need to assign explicit owners since everyone has access
    if (!workspace || workspace.visibility === 'public') return;

    if (orgAdmins.length > 0) {
      // Get the ID for Full Access
      let fullAccessId = null;
      const foundLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
      if (foundLevel) fullAccessId = foundLevel.id;

      for (const admin of orgAdmins) {
        await prisma.workspaceUser.upsert({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId: admin.id
            }
          },
          update: {
            memberType: MEMBER_TYPES.OWNER,
            accessLevelId: fullAccessId
          },
          create: {
            workspaceId,
            userId: admin.id,
            memberType: MEMBER_TYPES.OWNER,
            accessLevelId: fullAccessId
          }
        }).catch(err => console.error(`Failed to auto-assign admin ${admin.id} to workspace ${workspaceId}:`, err));
      }
    }
  } catch (error) {
    console.error("Error in autoAssignAdminsToWorkspace:", error);
  }
}

/**
 * Automatically assigns a newly appointed Admin or Super Admin to all existing workspaces in the org as OWNER.
 */
async function autoAssignNewAdminToWorkspaces(prisma, orgId, userId) {
  if (!orgId || !userId) return;

  try {
    const orgWorkspaces = await prisma.workspace.findMany({
      where: { orgId, visibility: 'private' },
      select: { id: true }
    });

    if (orgWorkspaces.length > 0) {
      // Get the ID for Full Access
      let fullAccessId = null;
      const foundLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
      if (foundLevel) fullAccessId = foundLevel.id;

      for (const workspace of orgWorkspaces) {
        await prisma.workspaceUser.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: workspace.id,
              userId: userId
            }
          },
          update: {
            memberType: MEMBER_TYPES.OWNER,
            accessLevelId: fullAccessId
          },
          create: {
            workspaceId: workspace.id,
            userId: userId,
            memberType: MEMBER_TYPES.OWNER,
            accessLevelId: fullAccessId
          }
        }).catch(err => console.error(`Failed to auto-assign new admin ${userId} to workspace ${workspace.id}:`, err));
      }
    }
  } catch (error) {
    console.error("Error in autoAssignNewAdminToWorkspaces:", error);
  }
}

/**
 * Automatically assigns default owners to a given private project based on workspace visibility.
 * - Public Workspace: Super Admins & Admins become project owners.
 * - Private Workspace: Existing Workspace Owners become project owners.
 */
async function autoAssignAdminsToProject(prisma, orgId, workspaceId, projectId) {
  if (!orgId || !workspaceId || !projectId) return;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { visibility: true }
    });

    if (!workspace) return;

    let usersToAssign = [];

    if (workspace.visibility === 'public' || workspace.visibility === 'PUBLIC') {
      // For public workspace, fetch org-wide admins
      const orgAdmins = await prisma.user.findMany({
        where: {
          orgId,
          roleRelation: {
            name: { in: ['Super Admin', 'Admin', 'System Admin'] }
          }
        },
        select: { id: true }
      });
      usersToAssign = orgAdmins.map(admin => admin.id);
    } else {
      // For private workspace, fetch workspace owners
      const workspaceOwners = await prisma.workspaceUser.findMany({
        where: {
          workspaceId,
          memberType: MEMBER_TYPES.OWNER
        },
        select: { userId: true }
      });
      usersToAssign = workspaceOwners.map(owner => owner.userId);
    }

    if (usersToAssign.length > 0) {
      let fullAccessId = null;
      const foundLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
      if (foundLevel) fullAccessId = foundLevel.id;

      for (const userId of usersToAssign) {
        await prisma.projectUser.upsert({
          where: {
            projectId_userId: {
              projectId,
              userId: userId
            }
          },
          update: {
            memberType: MEMBER_TYPES.OWNER,
            accessLevelId: fullAccessId
          },
          create: {
            projectId,
            userId: userId,
            memberType: MEMBER_TYPES.OWNER,
            accessLevelId: fullAccessId
          }
        }).catch(err => console.error(`Failed to auto-assign owner ${userId} to project ${projectId}:`, err));
      }
    }
  } catch (error) {
    console.error("Error in autoAssignAdminsToProject:", error);
  }
}

/**
 * Returns true if the user has access to the given workspace.
 *
 * Access is granted when ANY of the following is true:
 *  1. The user has an org-wide role (Super Admin / Admin / System Admin).
 *  2. The user has a direct row in `workspace_users`.
 *  3. The user is a member of a UserGroup that is linked to the workspace via `workspace_groups`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, role?: string, roleId?: string, orgId?: string }} user  - request.user
 * @param {string} workspaceId
 * @returns {Promise<boolean>}
 */
async function assertWorkspaceAccess(prisma, user, workspaceId) {
  if (!workspaceId || !user?.id) return false;

  // Org-wide admin roles always have access
  if (isOrgWideRole(user.role || user.roleId)) return true;

  const userId = user.id;

  // 1. Direct membership
  const directMember = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId },
    select: { userId: true }
  });
  if (directMember) return true;

  // 2. Group membership
  const groupMember = await prisma.workspaceGroup.findFirst({
    where: {
      workspaceId,
      group: {
        members: { some: { userId } }
      }
    },
    select: { workspaceId: true }
  });
  if (groupMember) return true;

  return false;
}

/**
 * Automatically assigns default owners to a given private asset based on workspace visibility.
 * - Public Workspace: Super Admins & Admins become asset owners.
 * - Private Workspace: Existing Workspace Owners become asset owners.
 */
async function autoAssignAdminsToAsset(prisma, orgId, workspaceId, assetId) {
  if (!orgId || !workspaceId || !assetId) return;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { visibility: true }
    });

    if (!workspace) return;

    let usersToAssign = [];

    if (workspace.visibility === 'public' || workspace.visibility === 'PUBLIC') {
      // For public workspace, fetch org-wide admins
      const orgAdmins = await prisma.user.findMany({
        where: {
          orgId,
          roleRelation: {
            name: { in: ['Super Admin', 'Admin', 'System Admin'] }
          }
        },
        select: { id: true }
      });
      usersToAssign = orgAdmins.map(admin => admin.id);
    } else {
      // For private workspace, fetch workspace owners
      const workspaceOwners = await prisma.workspaceUser.findMany({
        where: {
          workspaceId,
          memberType: MEMBER_TYPES.OWNER
        },
        select: { userId: true }
      });
      usersToAssign = workspaceOwners.map(owner => owner.userId);
    }

    if (usersToAssign.length > 0) {
      let fullAccessId = null;
      const foundLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
      if (foundLevel) fullAccessId = foundLevel.id;

      for (const userId of usersToAssign) {
        await prisma.assetUser.upsert({
          where: {
            assetId_userId: {
              assetId,
              userId: userId
            }
          },
          update: {
            accessLevelId: fullAccessId
          },
          create: {
            assetId,
            userId: userId,
            accessLevelId: fullAccessId
          }
        }).catch(err => console.error(`Failed to auto-assign owner ${userId} to asset ${assetId}:`, err));
      }
    }
  } catch (error) {
    console.error("Error in autoAssignAdminsToAsset:", error);
  }
}

/**
 * Automatically assigns Project Owners as owners of a private asset uploaded within a project context.
 * Used when visibility = private AND the upload was initiated via a project URL.
 */
async function autoAssignProjectOwnersToAsset(prisma, orgId, projectId, assetId) {
  if (!projectId || !assetId) return;

  try {
    const projectOwners = await prisma.projectUser.findMany({
      where: { projectId, memberType: MEMBER_TYPES.OWNER },
      select: { userId: true }
    });

    if (projectOwners.length === 0) {
      // Fallback: no project owners found, use org-wide admins
      const orgAdmins = await prisma.user.findMany({
        where: {
          orgId,
          roleRelation: { name: { in: ['Super Admin', 'Admin', 'System Admin'] } }
        },
        select: { id: true }
      });
      projectOwners.push(...orgAdmins.map(a => ({ userId: a.id })));
    }

    let fullAccessId = null;
    const foundLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
    if (foundLevel) fullAccessId = foundLevel.id;

    for (const { userId } of projectOwners) {
      await prisma.assetUser.upsert({
        where: { assetId_userId: { assetId, userId } },
        update: { accessLevelId: fullAccessId },
        create: { assetId, userId, accessLevelId: fullAccessId }
      }).catch(err => console.error(`Failed to auto-assign project owner ${userId} to asset ${assetId}:`, err));
    }
  } catch (error) {
    console.error("Error in autoAssignProjectOwnersToAsset:", error);
  }
}

/**
 * Checks if a user can access a specific asset — either via direct AssetUser/AssetGroup membership
 * OR via regular workspace access. This allows users to access a specific shared file even if
 * they have no workspace membership (direct share bypass).
 */
async function assertAssetOrWorkspaceAccess(prisma, user, assetId, workspaceId) {
  if (!user?.id) return false;

  // Org-wide admins always have access
  if (isOrgWideRole(user.role || user.roleId)) return true;

  const userId = user.id;

  // 1. Check direct AssetUser record (explicit share — bypasses workspace check)
  const directAssetAccess = await prisma.assetUser.findFirst({
    where: { assetId, userId },
    select: { userId: true }
  });
  if (directAssetAccess) return true;

  // 2. Check AssetGroup membership
  const groupAssetAccess = await prisma.assetGroup.findFirst({
    where: {
      assetId,
      group: { members: { some: { userId } } }
    },
    select: { assetId: true }
  });
  if (groupAssetAccess) return true;

  // 3. Fall back to regular workspace access check
  if (workspaceId) {
    return assertWorkspaceAccess(prisma, user, workspaceId);
  }

  return false;
}

module.exports = {
  autoAssignAdminsToWorkspace,
  autoAssignNewAdminToWorkspaces,
  autoAssignAdminsToProject,
  autoAssignAdminsToAsset,
  autoAssignProjectOwnersToAsset,
  assertWorkspaceAccess,
  assertAssetOrWorkspaceAccess,
};
