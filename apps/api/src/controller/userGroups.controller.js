// User Groups Controller
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
  try {
    const orgId = request.user?.orgId;
    const userId = request.user?.id;
    if (!orgId) {
      return reply.code(400).send({ error: 'Organization ID is required' });
    }

    const { name, description, memberIds } = request.body;
    
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

    return reply.status(201).send(newGroup);
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to create user group", message: error.message });
  }
};

module.exports.updateUserGroup = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name, description, memberIds } = request.body;
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

    return reply.send(updatedGroup);
  } catch (error) {
    request.log.error(error);
    // Handle unique constraint violation on update
    if (error.code === 'P2002') {
      return reply.code(400).send({ error: "A group with this name already exists" });
    }
    return reply.code(500).send({ error: "Failed to update user group", message: error.message });
  }
};

module.exports.deleteUserGroup = async (request, reply) => {
  try {
    const { id } = request.params;
    
    // Group members will be cascade deleted due to Prisma schema
    await request.server.prisma.userGroup.delete({
      where: { id }
    });
    
    return reply.send({ success: true, message: "Group deleted successfully" });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to delete user group", message: error.message });
  }
};
