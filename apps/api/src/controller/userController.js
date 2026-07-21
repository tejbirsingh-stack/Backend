// User and Team Management Controller
const { roles } = require('../lib');

// 1. Get all users belonging to the logged-in user's organization (orgId)
module.exports.getUsers = async (request, reply) => {
  try {
    if (!request.user || !request.user.id) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Authentication required to fetch users",
      });
    }

    // Get the orgId from the token payload or from the database if not in payload
    let orgId = request.user.orgId;
    if (!orgId) {
      const currentUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { orgId: true },
      });
      orgId = currentUser?.orgId;
    }

    if (!orgId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Logged-in user is not associated with any organization",
      });
    }

    // Fetch all users belonging to this orgId
    const users = await request.server.prisma.user.findMany({
      where: {
        orgId: orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        jobTitle: true,
        phone: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const formattedUsers = users.map(u => ({
      ...u,
      role: (u.roleRelation && u.roleRelation.name) ? u.roleRelation.name : u.role,
    }));

    return reply.send({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching organization users:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch organization users",
      details: error.message || String(error),
    });
  }
};

// 2. Get single user details
module.exports.getSingleUser = async (request, reply) => {
  return reply.send({
    message: `User ${request.params.id} endpoint not yet implemented`,
  });
};

// 3. Create user
module.exports.createUser = async (request, reply) => {
  return reply.send({ message: "User creation endpoint not yet implemented" });
};


module.exports.userAcitivites = async (request, reply) => {
  try {
    if (!request.user || !request.user.id) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Authentication required to fetch user activities",
      });
    }

    // Get the orgId from the token payload or from the database if not in payload
    let orgId = request.user.orgId;
    if (!orgId) {
      const currentUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { orgId: true },
      });
      orgId = currentUser?.orgId;
    }

    if (!orgId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Logged-in user is not associated with any organization",
      });
    }

    // Fetch all activities for this organization
    const activities = await request.server.prisma.AuditLog.findMany({
      where: {
        orgId: orgId,
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return reply.send({
      success: true,
      count: activities.length,
      activities: activities,
    });
  } catch (error) {
    console.error("Error fetching user activities:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch user activities",
      details: error.message || String(error),
    });
  }
}

module.exports.getRoles = async (request, reply) => {
  try {
    const Roles = await request.server.prisma.role.findMany({
      where: {
        name: {
          not: roles.SYSTEM_ADMIN
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return reply.send({
      success: true,
      roles: Roles
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch roles",
      details: error.message || String(error),
    });
  }
};