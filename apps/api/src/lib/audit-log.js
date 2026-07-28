const { PrismaClient } = require('@prisma/client');
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const ACTOR_TYPE = {
    USER: 'user',
    SYSTEM: 'system',
    CRON: 'cron'
}

const ACTIVITY_TYPE = {
    INFO: 'INFO',
    ERROR: 'ERROR'
}
const ACTIVITY_NAME = {
    USER_LOGIN: 'USER LOGIN',
    USER_REGISTER: 'USER REGISTER',
    FORGOT_PASSWORD: "FORGOT PASSWORD",
    RESET_PASSWORD: "RESET PASSWORD",
    CLEANUP_AUDIT_LOGS: 'CLEANUP AUDIT LOGS',
    UPLOAD_VIDEO: 'UPLOAD VIDEO',
    WORKSPACE_CREATED: "WORKSPACE CREATED",
    FAVORITE_ADDED: 'FAVORITE ADDED',
    FAVORITE_REMOVED: 'FAVORITE REMOVED'
}

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
                description: input.description,
                activityType: input.activityType,  //Error or Info
                actorType: input.actorType ?? ACTOR_TYPE.USER,
                userId: input.userDetail?.id,
                userName: input.userDetail?.name,
                userEmail: input.userDetail?.email,
                userRole: input.userDetail?.role,
                orgId: input.userDetail?.orgId,
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


module.exports = {
    logSuccess,
    logError,
    ACTOR_TYPE,
    ACTIVITY_TYPE,
    ACTIVITY_NAME
};