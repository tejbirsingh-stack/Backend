const { isOrgWideRole } = require('../lib/rbac-policy');
const { ACCESS_LEVEL } = require('../lib/rolesPermissions');

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
          update: {},
          create: {
            workspaceId,
            userId: admin.id,
            memberType: 'MEMBER',
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
 * Automatically assigns all Super Admins and Admins in the organization to a given private project.
 */
async function autoAssignAdminsToProject(prisma, orgId, projectId) {
  if (!orgId || !projectId) return;

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

    if (orgAdmins.length > 0) {
      let fullAccessId = null;
      const foundLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
      if (foundLevel) fullAccessId = foundLevel.id;

      for (const admin of orgAdmins) {
        await prisma.projectUser.upsert({
          where: {
            projectId_userId: {
              projectId,
              userId: admin.id
            }
          },
          update: {},
          create: {
            projectId,
            userId: admin.id,
            memberType: 'Member',
            accessLevelId: fullAccessId
          }
        }).catch(err => console.error(`Failed to auto-assign admin ${admin.id} to project ${projectId}:`, err));
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

module.exports = {
  autoAssignAdminsToWorkspace,
  autoAssignAdminsToProject,
  assertWorkspaceAccess,
};
