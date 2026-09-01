// User Groups Controller
const { logSuccess, logError, ACTIVITY_NAME } = require('../lib/audit-log');

module.exports.getUserGroups = async (request, reply) => {
  try {
    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    const groups = await request.server.prisma.userGroup.findMany({
      where: { orgId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        createdBy: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send(groups);
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: "Failed to fetch user groups" });
  }
};

module.exports.createUserGroup = async (request, reply) => {
  const { name, description, memberIds } = request.body || {};
  try {
    const orgId = request.user?.orgId;
    const userId = request.user?.id;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    if (!name) {
      return reply.code(400).send({ error: "Group name is required" });
    }

    // Check if group exists in org
    const existingGroup = await request.server.prisma.userGroup.findUnique({
      where: {
        orgId_name: { orgId, name }
      }
    });

    if (existingGroup) {
      return reply.code(400).send({ error: "A group with this name already exists" });
    }

    const newGroup = await request.server.prisma.userGroup.create({
      data: {
        name,
        description,
        orgId,
        createdById: userId,
        members: {
          create: (memberIds || []).map(id => ({ userId: id }))
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        createdBy: {
          select: { name: true }
        }
      }
    });

    const memberCount = newGroup.members?.length || 0;
    logSuccess(ACTIVITY_NAME.USER_GROUP_CREATED, `Created user group "${newGroup.name}" with ${memberCount} member(s).`, request);

    return reply.status(201).send(newGroup);
  } catch (error) {
    request.log.error(error);
    logError(ACTIVITY_NAME.USER_GROUP_CREATED, `Failed to create user group "${name || ''}"`, request, error);
    return reply.code(500).send({ error: "Failed to create user group", message: error.message });
  }
};

module.exports.updateUserGroup = async (request, reply) => {
  const { id } = request.params;
  const { name, description, memberIds } = request.body || {};
  try {
    const orgId = request.user?.orgId;

    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    // Update the group and its members
    const updatedGroup = await request.server.prisma.$transaction(async (prisma) => {
      // 1. Update basic info
      const group = await prisma.userGroup.update({
        where: { id },
        data: { name, description }
      });

      // 2. If memberIds provided, sync them
      if (memberIds && Array.isArray(memberIds)) {
        // Delete all existing members
        await prisma.userGroupMember.deleteMany({
          where: { groupId: id }
        });
        
        // Add new members
        if (memberIds.length > 0) {
          await prisma.userGroupMember.createMany({
            data: memberIds.map(userId => ({
              groupId: id,
              userId: userId
            }))
          });
        }
      }

      // 3. Return updated group
      return await prisma.userGroup.findUnique({
        where: { id },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          },
          createdBy: {
            select: { name: true }
          }
        }
      });
    });

    logSuccess(ACTIVITY_NAME.USER_GROUP_UPDATED, `Updated user group "${updatedGroup?.name || name || id}".`, request);

    return reply.send(updatedGroup);
  } catch (error) {
    request.log.error(error);
    logError(ACTIVITY_NAME.USER_GROUP_UPDATED, `Failed to update user group "${name || id}"`, request, error);
    // Handle unique constraint violation on update
    if (error.code === 'P2002') {
      return reply.code(400).send({ error: "A group with this name already exists" });
    }
    return reply.code(500).send({ error: "Failed to update user group", message: error.message });
  }
};

module.exports.deleteUserGroup = async (request, reply) => {
  const { id } = request.params;
  try {
    // Verify Super Admin role
    let currentUserRole = request.user?.role || "";
    if (request.user?.id) {
      const liveUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        include: { roleRelation: true },
      });
      if (liveUser && liveUser.roleRelation && liveUser.roleRelation.name) {
        currentUserRole = liveUser.roleRelation.name;
      } else if (liveUser && liveUser.role) {
        currentUserRole = liveUser.role;
      }
    }
    const normalizedRole = currentUserRole.toLowerCase().replace(/[_ -]+/g, "");

    if (normalizedRole !== "superadmin") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Access denied. Only Super Admin can delete user groups.",
      });
    }

    const groupToDelete = await request.server.prisma.userGroup.findUnique({
      where: { id },
      select: { name: true }
    });

    // Group members will be cascade deleted due to Prisma schema
    await request.server.prisma.userGroup.delete({
      where: { id }
    });

    const groupName = groupToDelete?.name || id;
    logSuccess(ACTIVITY_NAME.USER_GROUP_DELETED, `Deleted user group "${groupName}".`, request);
    
    return reply.send({ success: true, message: "Group deleted successfully" });
  } catch (error) {
    request.log.error(error);
    logError(ACTIVITY_NAME.USER_GROUP_DELETED, `Failed to delete user group "${id}"`, request, error);
    return reply.code(500).send({ error: "Failed to delete user group", message: error.message });
  }
};

module.exports.getUserGroup = async (request, reply) => {
  try {
    const { id } = request.params;
    const group = await request.server.prisma.userGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        createdBy: { select: { name: true } }
      }
    });
    if (!group) {
      return reply.code(404).send({ error: "Group not found" });
    }
    return reply.send(group);
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch user group" });
  }
};

module.exports.addUserGroupMembers = async (request, reply) => {
  const { id } = request.params;
  const { memberIds } = request.body || {};
  try {
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return reply.code(400).send({ error: "memberIds array is required" });
    }

    const group = await request.server.prisma.userGroup.findUnique({
      where: { id },
      select: { name: true }
    });

    await request.server.prisma.userGroupMember.createMany({
      data: memberIds.map((userId) => ({ groupId: id, userId })),
      skipDuplicates: true,
    });

    const groupName = group?.name || id;
    logSuccess(ACTIVITY_NAME.USER_GROUP_MEMBERS_ADDED, `Added ${memberIds.length} member(s) to group "${groupName}".`, request);

    return reply.send({ success: true, message: "Members added successfully" });
  } catch (error) {
    request.log.error(error);
    logError(ACTIVITY_NAME.USER_GROUP_MEMBERS_ADDED, `Failed to add members to user group "${id}"`, request, error);
    return reply.code(500).send({ error: "Failed to add group members" });
  }
};

module.exports.removeUserGroupMember = async (request, reply) => {
  const { id, userId } = request.params;
  try {
    const group = await request.server.prisma.userGroup.findUnique({
      where: { id },
      select: { name: true }
    });

    const targetUser = await request.server.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });

    await request.server.prisma.userGroupMember.deleteMany({
      where: { groupId: id, userId },
    });

    const userNameOrEmail = targetUser?.name || targetUser?.email || userId;
    const groupName = group?.name || id;
    logSuccess(ACTIVITY_NAME.USER_GROUP_MEMBER_REMOVED, `Removed member "${userNameOrEmail}" from group "${groupName}".`, request);

    return reply.send({ success: true, message: "Member removed successfully" });
  } catch (error) {
    request.log.error(error);
    logError(ACTIVITY_NAME.USER_GROUP_MEMBER_REMOVED, `Failed to remove member from group "${id}"`, request, error);
    return reply.code(500).send({ error: "Failed to remove group member" });
  }
};

module.exports.listUserGroups = module.exports.getUserGroups;
