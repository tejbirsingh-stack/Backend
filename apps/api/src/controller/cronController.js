const { logSuccess, logError, ACTIVITY_NAME, ACTOR_TYPE } = require("../lib/audit-log");
const { createNotification, notifyRole } = require("./notificationController");
const { recordStorageDelta } = require("../services/usage-meter.service");
const B2StorageService = require("../b2-storage.cjs");

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

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
                files: true,
                deletedBy: {
                    include: { roleRelation: true }
                }
            }
        });

        let updatedCount = 0;
        let permanentlyDeletedCount = 0;

        if (affectedAssets.length > 0) {
            for (const asset of affectedAssets) {
                const userName = asset.deletedBy?.name || 'User';
                const roleName = (asset.deletedBy?.roleRelation?.name || asset.deletedBy?.role || 'Unknown Role').toLowerCase();
                const isSuperAdmin = roleName === 'super admin' || roleName === 'superadmin';

                if (isSuperAdmin) {
                    // Super Admin deleted this file 30 days ago: Purge permanently from B2 and DB
                    if (b2Storage.isEnabled() && asset.files && asset.files.length > 0) {
                        for (const f of asset.files) {
                            if (f.filePath) {
                                try {
                                    await b2Storage.deleteFile(f.filePath);
                                } catch (b2Err) {
                                    request.server.logger.warn(`[Cron Purge] Could not delete B2 key ${f.filePath}: ${b2Err.message}`);
                                }
                            }
                        }
                    }

                    const totalSize = (asset.files || []).reduce((acc, f) => acc + Number(f.sizeBytes || 0), 0);

                    await request.server.prisma.asset.delete({
                        where: { id: asset.id }
                    });

                    if (totalSize > 0 && asset.orgId) {
                        try {
                            await recordStorageDelta(request.server.prisma, {
                                orgId: asset.orgId,
                                deltaBytes: -totalSize,
                                assetId: asset.id,
                                reason: 'cron_superadmin_trash_purge',
                            });
                        } catch (dErr) {
                            request.server.logger.warn(`[Cron Purge] Failed to record storage delta: ${dErr.message}`);
                        }
                    }

                    if (asset.deletedByUserId) {
                        await createNotification(
                            request.server,
                            asset.deletedByUserId,
                            asset.orgId,
                            'deletion_approved',
                            'Permanently Deleted',
                            `File '${asset.title}' was automatically permanently deleted from B2 storage and DB after 30 days in Super Admin trash.`,
                            asset.id
                        );
                    }

                    logSuccess(
                        ACTIVITY_NAME.PERMANENT_DELETE || 'PERMANENT_DELETE',
                        `File '${asset.title}' (${asset.id}) deleted by Super Admin 30 days ago was permanently purged from B2 & DB by cron.`,
                        request,
                        null,
                        ACTOR_TYPE.CRON
                    );
                    permanentlyDeletedCount++;
                } else if (roleName === 'admin') {
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
                    updatedCount++;
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
                    updatedCount++;
                }
            }
        }

        return reply.send({
            success: true,
            message: `Processed trash retention: ${permanentlyDeletedCount} Super Admin trash assets permanently deleted from B2 & DB, ${updatedCount} assets escalated for review.`,
            permanentlyDeletedCount,
            updatedCount,
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

const cleanupReadNotifications = async (request, reply) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await request.server.prisma.notification.deleteMany({
            where: {
                isRead: true,
                createdAt: {
                    lte: thirtyDaysAgo,
                },
            },
        });

        return reply.send({
            success: true,
            message: `Deleted ${result.count} read notifications older than 30 days.`,
            deletedCount: result.count,
        });
    } catch (error) {
        request.server.logger.error('Error cleaning up read notifications', { error: error.message });
        return reply.status(500).send({
            success: false,
            message: 'Failed to clean up read notifications',
            error: error.message,
        });
    }
};

module.exports = {
    cleanupAuditLogs,
    processTrashRetention,
    cleanupReadNotifications,
};

