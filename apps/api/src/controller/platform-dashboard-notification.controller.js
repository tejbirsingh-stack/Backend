const prisma = require('../utils/prisma');

async function getOrCreateDashboardNotification() {
  let notification = await prisma.dashboardNotification.findFirst();
  if (!notification) {
    notification = await prisma.dashboardNotification.create({
      data: {
        isEnabled: false,
      },
    });
  }
  return notification;
}

module.exports.getDashboardNotification = async (request, reply) => {
  try {
    const notification = await getOrCreateDashboardNotification();
    
    // We only send back the relevant data needed by the frontend
    return reply.send({
      success: true,
      notification: {
        isEnabled: Boolean(notification.isEnabled),
        title: notification.title || '',
        body: notification.body || '',
        ctaLabel: notification.ctaLabel || '',
        ctaUrl: notification.ctaUrl || '',
        updatedAt: notification.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard notification:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to fetch dashboard notification',
    });
  }
};

module.exports.updateDashboardNotification = async (request, reply) => {
  try {
    const {
      isEnabled,
      title,
      body,
      ctaLabel,
      ctaUrl,
    } = request.body || {};

    const existing = await getOrCreateDashboardNotification();

    const updateData = {};
    if (typeof isEnabled === 'boolean') updateData.isEnabled = isEnabled;
    if (title !== undefined) updateData.title = title === '' ? null : title;
    if (body !== undefined) updateData.body = body === '' ? null : body;
    if (ctaLabel !== undefined) updateData.ctaLabel = ctaLabel === '' ? null : ctaLabel;
    if (ctaUrl !== undefined) updateData.ctaUrl = ctaUrl === '' ? null : ctaUrl;

    const updated = await prisma.dashboardNotification.update({
      where: { id: existing.id },
      data: updateData,
    });

    return reply.send({
      success: true,
      message: 'Dashboard notification updated successfully',
      notification: {
        isEnabled: Boolean(updated.isEnabled),
        title: updated.title || '',
        body: updated.body || '',
        ctaLabel: updated.ctaLabel || '',
        ctaUrl: updated.ctaUrl || '',
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating dashboard notification:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to update dashboard notification',
    });
  }
};
