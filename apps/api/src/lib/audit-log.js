const prisma = require('../utils/prisma.js');
const { roles } = require('./rolesPermissions');

async function buildItemPath(prisma, type, id) {
    try {
        let pathParts = [];
        let currentFolderId = null;
        let workspaceId = null;

        if (type === 'asset') {
            const asset = await prisma.asset.findUnique({ where: { id } });
            if (!asset) return 'Unknown Asset';
            pathParts.push(asset.title || 'Untitled Asset');

            if (asset.ownerType === 'WORKSPACE') {
                workspaceId = asset.ownerId;
            } else if (asset.ownerType === 'FOLDER') {
                currentFolderId = asset.ownerId;
            } else if (asset.ownerType === 'PROJECT') {
                const project = await prisma.project.findUnique({ where: { id: asset.ownerId } });
                if (project) {
                    pathParts.unshift(project.name);
                    workspaceId = project.workspaceId;
                    if (project.ownerType === 'FOLDER') currentFolderId = project.folderId;
                }
            }
        } else if (type === 'project') {
            const project = await prisma.project.findUnique({ where: { id } });
            if (!project) return 'Unknown Project';
            pathParts.push(project.name);
            workspaceId = project.workspaceId;
            if (project.ownerType === 'FOLDER') currentFolderId = project.folderId;
        } else if (type === 'folder') {
            currentFolderId = id;
        }

        // Traverse folders upward
        while (currentFolderId) {
            const folder = await prisma.folder.findUnique({ where: { id: currentFolderId } });
            if (!folder) break;
            if (type === 'folder' && id === currentFolderId) {
                pathParts.push(folder.name);
            } else {
                pathParts.unshift(folder.name);
            }
            workspaceId = folder.workspaceId;
            currentFolderId = folder.parentId;
        }

        // Get workspace name
        if (workspaceId) {
            const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
            if (workspace) {
                pathParts.unshift(workspace.name);
            }
        }

        return pathParts.join(' -> ');
    } catch (err) {
        console.error('Error building item path:', err);
        return 'Unknown Item';
    }
}

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
    USER_LOGIN: 'User Login',
    USER_REGISTER: 'User Register',
    FORGOT_PASSWORD: "Forgot Password",
    RESET_PASSWORD: "Reset Password",
    CLEANUP_AUDIT_LOGS: 'Cleanup Audit Logs',
    UPLOAD_VIDEO: 'Upload Video',
    WORKSPACE_CREATED: "Workspace Created",
    FAVORITE_ADDED: 'Favorite Added',
    FAVORITE_REMOVED: 'Favorite Removed',

    // Dashboard User & Organization Settings
    PROFILE_UPDATED: 'Profile Updated',
    PROFILE_PHOTO_UPLOADED: 'Profile Photo Uploaded',
    USER_ADMIN_UPDATED: 'User Admin Updated',
    USERS_DELETED: 'Users Deleted',
    USERS_BULK_UPDATED: 'Users Bulk Updated',
    COMPANY_INFO_UPDATED: 'Company Info Updated',
    COMPANY_LOGO_UPLOADED: 'Company Logo Uploaded',
    SHARE_SETTINGS_UPDATED: 'Share Settings Updated',
    BRANDING_SETTINGS_UPDATED: 'Branding Settings Updated',
    BRANDING_HEADER_UPLOADED: 'Branding Header Uploaded',

    // Folders & Projects
    FOLDER_CREATED: 'Folder Created',
    FOLDER_UPDATED: 'Folder Updated',
    FOLDER_DELETED: 'Folder Deleted',
    FOLDER_MOVED: 'Folder Moved',
    PROJECT_CREATED: 'Project Created',
    PROJECT_UPDATED: 'Project Updated',
    PROJECT_DELETED: 'Project Deleted',

    // Tags
    TAG_CREATED: 'Tag Created',
    TAG_UPDATED: 'Tag Updated',
    TAG_DELETED: 'Tag Deleted',

    // Media
    MEDIA_UPLOADED: 'Media Uploaded',
    MEDIA_RENAMED: 'Media Renamed',
    MEDIA_MOVED: 'Media Moved',
    MEDIA_SOFT_DELETED: 'Media Soft Deleted',
    MEDIA_RESTORED: 'Media Restored',
    MEDIA_PERMANENTLY_DELETED: 'Media Permanently Deleted',

    //Annotation
    ANNOTATION_CREATED: 'Annotation Created',
    ANNOTATION_UPDATED: 'Annotation Updated',
    ANNOTATION_DELETED: 'Annotation Deleted',
    PROJECT_LINKED: 'Project Linked',
    PROJECT_UNLINKED: 'Project Unlinked',

    // Platform Activities
    PLAN_CREATED: 'Plan Created',
    PLAN_UPDATED: 'Plan Updated',
    PLAN_DELETED: 'Plan Deleted',
    ORGANIZATION_CREATED: 'Organization Created',
    ORGANIZATION_UPDATED: 'Organization Updated',
    WORKSPACE_UPDATED: 'Workspace Updated',
    SUBSCRIPTION_OVERRIDE: 'Subscription Override',
    MODERATION_FLAG_CREATED: 'Moderation Flag Created',
    MODERATION_FLAG_UPDATED: 'Moderation Flag Updated',
    ASSET_FORCE_DELETED: 'Asset Force-Deleted',
    LANDING_PAGE_UPDATED: 'Landing Page Updated',
    DEMO_REQUEST_SUBMITTED: 'Demo Request Submitted',
    PLATFORM_ADMIN_LOGIN: 'Platform Admin Login',
    PLATFORM_ADMIN_LOGOUT: 'Platform Admin Logout',
    DEFAULT_CONTENT_UPLOADED: 'Default Content Uploaded',
    DEFAULT_CONTENT_UPDATED: 'Default Content Updated',
    DEFAULT_CONTENT_DELETED: 'Default Content Deleted',
    USER_INVITED: 'User Invited',
    USER_UPDATED: 'User Updated',
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
    ACTIVITY_NAME,
    buildItemPath
};