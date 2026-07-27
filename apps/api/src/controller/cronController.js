const { logSuccess, logError, ACTIVITY_NAME, ACTOR_TYPE } = require("../lib/audit-log");
const { notifyRole } = require("./notificationController");
const cleanupAuditLogs = async (request, reply) => {
    try {
        // Determine the cutoff date, e.g., older than 30 days
        // const daysToKeep = parseInt(request.query.days || request.body?.days || '30', 10);
        const daysToKeep = 365;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        // Soft delete records older than the cutoff date by setting deletedAt
        const result = await request.server.prisma.auditLog.updateMany({
            where: {
                createdAt: {
                    lt: cutoffDate,
                },
                deletedAt: null,
            },
            data: {
                deletedAt: new Date(),
            },
        });

        logSuccess(ACTIVITY_NAME.CLEANUP_AUDIT_LOGS, `Audit logs older than ${daysToKeep} days soft-deleted successfully.`, request, null, ACTOR_TYPE.CRON)
        return reply.send({
            success: true,
            message: `Audit logs older than ${daysToKeep} days soft-deleted successfully.`,
            updatedCount: result.count,
        });
    } catch (error) {
        request.server.logger.error('Error soft-deleting audit logs', { error: error.message });

        logError(ACTIVITY_NAME.CLEANUP_AUDIT_LOGS, `Failed to clean up audit logs, Error : ${error?.message}`, request, error, null, ACTOR_TYPE.CRON)
        return reply.status(500).send({
            success: false,
            message: 'Failed to clean up audit logs',
            error: error.message,
        });
    }
};

const processTrashRetention = async (request, reply) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const affectedAssets = await request.server.prisma.asset.findMany({
            where: {
                status: 'trash',
                deletedAt: {
                    lte: thirtyDaysAgo,
                },
            },
            include: {
                deletedBy: {
                    include: { roleRelation: true }
                }
            }
        });

        let updatedCount = 0;
        if (affectedAssets.length > 0) {
            for (const asset of affectedAssets) {
                const userName = asset.deletedBy?.name || 'User';
                const roleName = (asset.deletedBy?.roleRelation?.name || asset.deletedBy?.role || 'Unknown Role').toLowerCase();
                
                if (roleName === 'admin') {
                    // Admin deleted this 30 days ago, escalate to Super Admin
                    await request.server.prisma.asset.update({
                        where: { id: asset.id },
                        data: { status: 'pending_super_admin' }
                    });
                    
                    await notifyRole(
                        request.server, 
                        asset.orgId, 
                        'Super Admin', 
                        'approval_request', 
                        'Super Admin Deletion Review', 
                        `${userName} (Admin) deleted file: '${asset.title}' 30 days ago. Final approval needed.`,
                        asset.id
                    );
                } else {
                    // Editor/Collaborator deleted this 30 days ago, escalate to Admin
                    await request.server.prisma.asset.update({
                        where: { id: asset.id },
                        data: { status: 'pending_admin_review' }
                    });
                    
                    await notifyRole(
                        request.server, 
                        asset.orgId, 
                        'Admin', 
                        'approval_request', 
                        'Pending Deletion', 
                        `${userName} (${asset.deletedBy?.roleRelation?.name || 'Editor'}) deleted file: '${asset.title}' 30 days ago. Please review.`,
                        asset.id
                    );
                }
                updatedCount++;
            }
        }

        return reply.send({
            success: true,
            message: `Processed ${updatedCount} trash assets for admin review.`,
            updatedCount: updatedCount,
        });
    } catch (error) {
        request.server.logger.error('Error processing trash retention', { error: error.message });
        return reply.status(500).send({
            success: false,
            message: 'Failed to process trash retention',
            error: error.message,
        });
    }
};

module.exports = {
    cleanupAuditLogs,
    processTrashRetention,
};
