const { logSuccess, logError, ACTIVITY_NAME, ACTOR_TYPE } = require("../lib/audit-log");
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

        logError(ACTIVITY_NAME.CLEANUP_AUDIT_LOGS, `Failed to clean up audit logs, Error : ${error.message}`, request, error, null, ACTOR_TYPE.CRON)
        return reply.status(500).send({
            success: false,
            message: 'Failed to clean up audit logs',
            error: error.message,
        });
    }
};

module.exports = {
    cleanupAuditLogs,
};
