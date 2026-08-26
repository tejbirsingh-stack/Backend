const prisma = require('../utils/prisma.js');
const { roles } = require('./rolesPermissions');

const ACTOR_TYPE = {
    USER: 'user',
    SYSTEM: 'system',
    CRON: 'cron',
};

const ACTIVITY_TYPE = {
    INFO: 'INFO',
    ERROR: 'ERROR'
};

const ACTIVITY_NAME = {
    USER_LOGIN: 'USER LOGIN',
    USER_REGISTER: 'USER REGISTER',
    FORGOT_PASSWORD: "FORGOT PASSWORD",
    RESET_PASSWORD: "RESET PASSWORD",
    CLEANUP_AUDIT_LOGS: 'CLEANUP AUDIT LOGS',
    UPLOAD_VIDEO: 'UPLOAD VIDEO',
    WORKSPACE_CREATED: "WORKSPACE CREATED",
    FAVORITE_ADDED: 'FAVORITE ADDED',
    FAVORITE_REMOVED: 'FAVORITE REMOVED',
    
    // Platform Activities
    PLAN_CREATED: 'Plan created',
    PLAN_UPDATED: 'Plan updated',
    PLAN_DELETED: 'Plan deleted',
    ORGANIZATION_CREATED: 'Organization created',
    ORGANIZATION_UPDATED: 'Organization updated',
    WORKSPACE_UPDATED: 'Workspace updated',
    SUBSCRIPTION_OVERRIDE: 'Subscription override',
    MODERATION_FLAG_CREATED: 'Moderation flag created',
    MODERATION_FLAG_UPDATED: 'Moderation flag updated',
    ASSET_FORCE_DELETED: 'Asset force-deleted',
    LANDING_PAGE_UPDATED: 'Landing page updated',
    DEMO_REQUEST_SUBMITTED: 'Demo request submitted',
    PLATFORM_ADMIN_LOGIN: 'Platform admin login',
    PLATFORM_ADMIN_LOGOUT: 'Platform admin logout',
    DEFAULT_CONTENT_UPLOADED: 'Default content uploaded',
    DEFAULT_CONTENT_UPDATED: 'Default content updated',
    DEFAULT_CONTENT_DELETED: 'Default content deleted',
    USER_INVITED: 'User invited',
    USER_UPDATED: 'User updated'
};

async function errorToString(error) {
    if (!error)
        return null;
    if (error instanceof Error) {
        return JSON.stringify({
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...error,
        });
    }
    // error is a plain object or something else
    return typeof error === 'object' ? JSON.stringify(error) : String(error);
}

async function recordActivity(input) {
    try {
        await prisma.auditLog.create({
            data: {
                activityName: input.activityName,
                description: input.description || null,
                activityType: input.activityType || ACTIVITY_TYPE.INFO,
                actorType: input.actorType ?? ACTOR_TYPE.USER,
                userId: input.userDetail?.id || input.userId || null,
                userName: input.userDetail?.name || input.userName || null,
                userEmail: input.userDetail?.email || input.userEmail || null,
                userRole: input.userDetail?.role || input.userRole || null,
                orgId: input.userDetail?.orgId || input.orgId || null,
                error: await errorToString(input.error),
            },
        });
    } catch (e) {
        console.error("Failed to record audit log:", e.message);
    }
}

// Log successful operation
function logSuccess(activityName, description = '', request, user = null, actorType = ACTOR_TYPE.USER) {
    let userDetail = null;
    if (request?.user) {
        userDetail = request.user;
    } else {
        userDetail = user;
    }
    return recordActivity({
        activityName,
        description,
        activityType: ACTIVITY_TYPE.INFO,
        userDetail,
        actorType
    });
}

// Log failed operation
function logError(activityName, description = '', request, error = null, user = null, actorType = ACTOR_TYPE.USER) {
    let userDetail = null;
    if (request?.user) {
        userDetail = request.user;
    } else {
        userDetail = user;
    }
    return recordActivity({
        activityName,
        description,
        activityType: ACTIVITY_TYPE.ERROR,
        error,
        userDetail,
        actorType
    });
}

// Helper for platform admin audit logs
function writePlatformAudit({
    activityName,
    description = '',
    activityType = ACTIVITY_TYPE.INFO,
    admin = null,
    orgId = null,
    error = null,
}) {
    const isError = Boolean(error) || (activityType && String(activityType).toUpperCase() === 'ERROR');
    const userDetail = {
        id: null,
        name: admin?.name || roles.PLATFORM_ADMIN,
        email: admin?.email || null,
        role: roles.PLATFORM_ADMIN,
        orgId: orgId || null,
    };

    if (isError) {
        return logError(
            activityName,
            description,
            null,
            error,
            userDetail,
            ACTOR_TYPE.USER
        );
    }

    return logSuccess(
        activityName,
        description,
        null,
        userDetail,
        ACTOR_TYPE.USER
    );
}

module.exports = {
    logSuccess,
    logError,
    writePlatformAudit,
    recordActivity,
    ACTOR_TYPE,
    ACTIVITY_TYPE,
    ACTIVITY_NAME
};