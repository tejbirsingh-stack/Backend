const { sendNotificationToUser } = require('./realtimeController');

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

const deleteNotification = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { notificationId } = request.params;

    if (notificationId === 'all') {
      await request.server.prisma.notification.deleteMany({
        where: { userId }
      });
    } else {
      await request.server.prisma.notification.deleteMany({
        where: { id: notificationId, userId }
      });
    }

    return reply.send({ success: true, message: "Notification deleted successfully" });
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
    
    // Emit real-time WebSocket event to recipient user
    sendNotificationToUser(userId, {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      time: new Date(notification.createdAt).toLocaleDateString() + ' ' + new Date(notification.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      unread: !notification.isRead,
      type: notification.type,
      relatedEntityId: notification.relatedEntityId
    });

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// Internal helper function to notify all users with a specific role in an org
const notifyRole = async (fastify, orgId, roleName, type, title, message, relatedEntityId = null) => {
  try {
    const isSuperAdminRole = ['super admin', 'superadmin', 'super_admin'].includes(String(roleName).toLowerCase());

    const roleNamesToMatch = isSuperAdminRole
      ? ['Super Admin', 'SuperAdmin', 'super_admin', 'super admin', 'System Admin']
      : [roleName];

    const whereClause = {
      roleRelation: {
        name: { in: roleNamesToMatch, mode: 'insensitive' }
      }
    };
    if (orgId) {
      whereClause.orgId = orgId;
    }

    const users = await fastify.prisma.user.findMany({
      where: whereClause
    });
    
    for (const user of users) {
      await createNotification(fastify, user.id, user.orgId || orgId, type, title, message, relatedEntityId);
    }
  } catch(error) {
    console.error(`Error notifying role ${roleName}:`, error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  deleteNotification,
  createNotification,
  notifyRole
};

