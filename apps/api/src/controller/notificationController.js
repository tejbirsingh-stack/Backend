const getNotifications = async (request, reply) => {
  try {
    const userId = request.user.id;
    const orgId = request.user.orgId;
    
    const notifications = await request.server.prisma.notification.findMany({
      where: {
        userId,
        orgId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50 // Limit to last 50
    });

    return reply.send({ success: true, notifications });
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message });
  }
};

const markAsRead = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { notificationId } = request.params;

    if (notificationId === 'all') {
      await request.server.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });
    } else {
      await request.server.prisma.notification.update({
        where: { id: notificationId, userId },
        data: { isRead: true }
      });
    }

    return reply.send({ success: true, message: "Marked as read" });
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message });
  }
};

// Internal helper function (not a route handler)
const createNotification = async (fastify, userId, orgId, type, title, message, relatedEntityId = null) => {
  try {
    const notification = await fastify.prisma.notification.create({
      data: {
        userId,
        orgId,
        type,
        title,
        message,
        relatedEntityId
      }
    });
    
    // We will emit WebSocket event here later
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// Internal helper function to notify all users with a specific role in an org
const notifyRole = async (fastify, orgId, roleName, type, title, message, relatedEntityId = null) => {
  try {
    const users = await fastify.prisma.user.findMany({
      where: { 
        orgId, 
        roleRelation: { name: roleName } 
      }
    });
    
    for (const user of users) {
      await createNotification(fastify, user.id, orgId, type, title, message, relatedEntityId);
    }
  } catch(error) {
    console.error(`Error notifying role ${roleName}:`, error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  createNotification,
  notifyRole
};
