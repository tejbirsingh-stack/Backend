const prisma = require('../utils/prisma');
const { resolveUserProjectPermissions } = require("../lib/rbac-policy");
const crypto = require('crypto');
const { logSuccess, ACTIVITY_NAME, logError, buildItemPath } = require('../lib/audit-log');
const emailService = require('../services/email-service');
const { getAncestors } = require('../services/tagHierarchy');
const { autoAssignAdminsToWorkspace, autoAssignAdminsToProject, assertWorkspaceAccess } = require('../services/workspace.service');
const { isOrgWideRole, resolveUserWorkspacePermissions } = require('../lib/rbac-policy');
const { verifyProjectAccess } = require('../utils/projectAccessUtils');
const { createNotification, notifyRole } = require('./notificationController');
const { ACCESS_LEVEL, MEMBER_TYPES, VISIBILITY } = require('../lib/rolesPermissions');
const B2StorageService = require('../b2-storage.cjs');
const { recordStorageDelta } = require('../services/usage-meter.service');
const { resolveOrgBranding } = require('../services/branding.service');
const { ensureDefaultOrganizationSettings } = require("../services/organization.service");
const { generateUniqueWorkspaceName } = require('../utils/uniqueNameUtils');
const { getB2Storage } = require('../services/b2Config');

/** Lazily-resolved B2 storage (creds from .env in dev, AWS Secrets Manager in all other envs) */
async function b2() { return getB2Storage(B2StorageService); }

function formatWorkspaceNameWithSuffix(value) {
    if (!value || typeof value !== "string") return "ARK";
    let trimmed = value.trim();
    if (trimmed.endsWith("-ARK")) {
        return trimmed;
    }
    trimmed = trimmed.replace(/-Workspace$/i, "").replace(/-ARK$/i, "").replace(/-Workspace-ARK$/i, "").trim();
    return `${trimmed}-ARK`;
}

async function getPendingOrDeletedFolderIds(prismaClient) {
    try {
        const pendingAssets = await prismaClient.asset.findMany({
            where: {
                OR: [
                    { type: 'folder' },
                    { deletionReason: { contains: 'Deleted with folder' } }
                ]
            },
            select: { ownerId: true, ownerType: true, type: true, status: true, deletionReason: true }
        }).catch(() => []);

        const pendingSet = new Set();
        pendingAssets.forEach(a => {
            if (a.type === 'folder' && a.ownerId && a.ownerType === 'FOLDER' && a.status !== 'active') {
                pendingSet.add(String(a.ownerId));
            }
            if (a.deletionReason) {
                const match = a.deletionReason.match(/Deleted with folder:\s*\[([0-9a-fA-F-]+)\]/i);
                if (match && match[1]) {
                    pendingSet.add(match[1]);
                }
            }
        });
        return Array.from(pendingSet);
    } catch (err) {
        console.error('Error in getPendingOrDeletedFolderIds:', err);
        return [];
    }
}

async function getPendingOrDeletedFolderIds(prismaClient) {
    try {
        const pendingAssets = await prismaClient.asset.findMany({
            where: {
                OR: [
                    { type: 'folder' },
                    { deletionReason: { contains: 'Deleted with folder' } }
                ]
            },
            select: { ownerId: true, ownerType: true, type: true, status: true, deletionReason: true }
        }).catch(() => []);

        const pendingSet = new Set();
        pendingAssets.forEach(a => {
            if (a.type === 'folder' && a.ownerId && a.ownerType === 'FOLDER' && a.status !== 'active') {
                pendingSet.add(String(a.ownerId));
            }
            if (a.deletionReason) {
                const match = a.deletionReason.match(/Deleted with folder:\s*\[([0-9a-fA-F-]+)\]/i);
                if (match && match[1]) {
                    pendingSet.add(match[1]);
                }
            }
        });
        return Array.from(pendingSet);
    } catch (err) {
        console.error('Error in getPendingOrDeletedFolderIds:', err);
        return [];
    }
}

module.exports.storeWorkplace = async (request, reply) => {
    try {
        const userRoleName = typeof request.user?.role === 'string' ? request.user.role : '';
        const isSuperAdmin = userRoleName === 'Super Admin' || request.user?.roleId === '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15' || userRoleName.toLowerCase() === 'superadmin' || userRoleName.toLowerCase() === 'super_admin';

        if (!isSuperAdmin) {
            return reply.code(403).send({
                success: false,
                message: 'Super Admin privileges required to create workspaces.'
            });
        }

        const { name, description, color, inviteEmails, inviteGroupIds, memberType, accessLevel, isRestricted, sendInviteEmail } = request.body;

        // Default values for granular permissions if not provided
        const mType = memberType || MEMBER_TYPES.MEMBER;
        let aLevel = accessLevel || 'FULL_ACCESS';

        // Resolve access level string/ID for invited users
        let aLevelId = accessLevel;
        let aLevelName = ACCESS_LEVEL.FULL_ACCESS;
        if (aLevelId) {
            const foundLevel = await prisma.accessLevel.findUnique({ where: { id: aLevelId } }).catch(() => null);
            if (foundLevel) {
                aLevelName = foundLevel.name.toUpperCase().replace(/\s+/g, '_');
            } else {
                const fallbackLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
                aLevelId = fallbackLevel ? fallbackLevel.id : null;
            }
        } else {
            const fallbackLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
            aLevelId = fallbackLevel ? fallbackLevel.id : null;
        }

        const { orgId } = request.user;
        const userId = request.user?.id || request.user?.userId || request.user?.sub;

        if (!orgId || !name) {
            return reply.code(400).send({
                success: false,
                message: 'Organization ID and Name are required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Workspace name cannot exceed 100 characters.'
            });
        }

        if (description && description.length > 500) {
            return reply.code(400).send({
                success: false,
                message: 'Workspace description cannot exceed 500 characters.'
            });
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { currentPlan: true }
        });
        const maxWorkspaces = org?.currentPlan?.maxWorkspaces ?? org?.maxWorkspaces ?? 1;
        const currentWorkspaceCount = await prisma.workspace.count({ where: { orgId } });
        if (currentWorkspaceCount >= maxWorkspaces) {
            return reply.code(403).send({
                success: false,
                message: `Workspace limit (${maxWorkspaces}) reached for your current plan. Please upgrade to create more workspaces.`
            });
        }

        const formattedWorkspaceName = formatWorkspaceNameWithSuffix(name);

        const existing = await prisma.workspace.findFirst({
            where: {
                orgId,
                OR: [
                    { name: formattedWorkspaceName },
                    { name: name.trim() }
                ]
            }
        });
        if (existing)
            return reply.code(409).send({
                success: false,
                message: "Name already exist",
                data: null
            });

        const workspace = await prisma.workspace.create({
            data: {
                orgId,
                name: formattedWorkspaceName,
                description,
                color,
                visibility: isRestricted ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC
            }
        });

        // 1. Link creator user to WorkspaceUser (same as signup flow)
        if (userId) {
            let creatorAccessLevelId = null;
            const fullAccessLevel = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
            if (fullAccessLevel) {
                creatorAccessLevelId = fullAccessLevel.id;
            }

            await prisma.workspaceUser.create({
                data: {
                    workspaceId: workspace.id,
                    userId: userId,
                    memberType: MEMBER_TYPES.OWNER,
                    accessLevelId: creatorAccessLevelId
                }
            }).catch(err => {
                console.error("Failed to create workspaceUser for creator:", err);
            });
        }

        // 2. Link invited users if inviteEmails supplied
        if (Array.isArray(inviteEmails) && inviteEmails.length > 0) {
            for (const email of inviteEmails) {
                if (!email || typeof email !== 'string') continue;

                const cleanEmail = email.toLowerCase().trim();

                const invitedUser = await prisma.user.findFirst({
                    where: { email: cleanEmail }
                });

                if (!invitedUser || invitedUser.status !== 'active') {
                    // Skip invalid/inactive user
                    continue;
                }

                if (invitedUser.id === userId) {
                    // Skip if they invite themselves
                    continue;
                }

                const isGuest = invitedUser.orgId !== orgId;
                
                // If the workspace is public (not restricted), we strictly forbid inviting members
                if (!isRestricted && !isGuest) {
                    continue;
                }

                const actualMemberType = isGuest ? MEMBER_TYPES.GUEST : MEMBER_TYPES.MEMBER;

                await prisma.workspaceUser.create({
                    data: {
                        workspaceId: workspace.id,
                        userId: invitedUser.id,
                        memberType: actualMemberType,
                        accessLevelId: aLevelId
                    }
                }).catch(() => {});

                // ALWAYS send in-app notification
                createNotification(
                    request.server,
                    invitedUser.id,
                    invitedUser.orgId || orgId,
                    'workspace_invite',
                    'Invited to workspace',
                    `${request.user.name || request.user.email} added you to workspace "${name}"`,
                    workspace.id
                ).catch(err => console.error('Failed to create in-app notification:', err));

                if (sendInviteEmail) {
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    const appUrl = `${frontendUrl}`;
                    if (isGuest) {
                        const orgNameObj = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
                        emailService.sendWorkspaceGuestInvite(cleanEmail, {
                            workspaceName: name,
                            organizationName: orgNameObj?.name || 'Your Organization',
                            appUrl
                        }).catch(() => { });
                    } else {
                        emailService.sendWorkspaceMemberInvite(cleanEmail, {
                            workspaceName: name,
                            inviterName: request.user.name || request.user.email,
                            appUrl
                        }).catch(() => { });
                    }
                }
            }
        }

        // 3. Link members of invited groups if inviteGroupIds supplied
        if (Array.isArray(inviteGroupIds) && inviteGroupIds.length > 0) {
            for (const groupId of inviteGroupIds) {
                if (typeof groupId === 'string') {
                    // Create the WorkspaceGroup link directly to give everyone in the group access
                    await prisma.workspaceGroup.create({
                        data: {
                            workspaceId: workspace.id,
                            groupId: groupId,
                            accessLevelId: aLevelId
                        }
                    }).catch(() => { });
                }
            }
        }

        // 4. Automatically grant access to all Super Admins and Admins in the organization
        await autoAssignAdminsToWorkspace(prisma, orgId, workspace.id);


        logSuccess(ACTIVITY_NAME.WORKSPACE_CREATED, "Workspace created successfully.", request);
        return reply.code(201).send({
            success: true,
            message: 'Workspace created successfully.',
            data: workspace
        });

    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME.WORKSPACE_CREATED, `Failed to create workspace, Error : ${error?.message}`, request, error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

// Validate a guest user email: must exist, be active, have an org, and NOT be from the requester's org
module.exports.validateGuestUser = async (request, reply) => {
    try {
        const { email } = request.query || {};
        const { orgId } = request.user;

        if (!email || typeof email !== 'string') {
            return reply.code(400).send({ valid: false, reason: 'Email is required.' });
        }

        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase().trim() }
        });

        if (!user) {
            return reply.code(200).send({ valid: false, reason: 'User not found in the system.' });
        }
        if (user.status !== 'active') {
            return reply.code(200).send({ valid: false, reason: 'User account is not active.' });
        }
        if (!user.orgId) {
            return reply.code(200).send({ valid: false, reason: 'User does not belong to any organization.' });
        }
        if (user.orgId === orgId) {
            return reply.code(200).send({ valid: false, reason: 'User is already a member of your organization. Use the Member type instead.' });
        }

        return reply.code(200).send({
            valid: true,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({ valid: false, reason: 'Internal Server Error' });
    }
};

module.exports.updateWorkspace = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name, description, color, status } = request.body;
        const { orgId } = request.user;

        const workspace = await prisma.workspace.findFirst({
            where: { id, orgId }
        });

        if (!workspace) {
            return reply.code(404).send({ success: false, message: 'Workspace not found.' });
        }

        const dataToUpdate = {};
        if (name !== undefined) dataToUpdate.name = name;
        if (description !== undefined) dataToUpdate.description = description;
        if (color !== undefined) dataToUpdate.color = color;
        if (status !== undefined) dataToUpdate.status = status;

        const updated = await prisma.workspace.update({
            where: { id },
            data: dataToUpdate
        });

        logSuccess(ACTIVITY_NAME.WORKSPACE_UPDATED, `Workspace "${workspace.name}" updated.`, request);

        return reply.code(200).send({
            success: true,
            message: 'Workspace updated successfully.',
            data: updated
        });
    } catch (error) {
        console.error('Error updating workspace:', error);
        logError(ACTIVITY_NAME.WORKSPACE_UPDATED, `Failed to update workspace status, Error : ${error?.message}`, request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.findAllWorkspaces = async (request, reply) => {
    try {
        const { orgId } = request.user || {};
        const userId = request.user?.id || request.user?.userId || request.user?.sub;
        const { includeInactive } = request.query || {};

        if (!userId) {
            return reply.code(401).send({
                success: false,
                message: 'Unauthorized'
            });
        }

        // Check if this user is a cross-org guest (has WorkspaceUser records in workspaces NOT from their org)
        const guestMemberships = await prisma.workspaceUser.findMany({
            where: {
                userId,
                workspace: orgId ? { orgId: { not: orgId } } : {}
            },
            select: { workspaceId: true }
        });
        const guestWorkspaceIds = guestMemberships.map(m => m.workspaceId);

        let whereCondition = {
            OR: [
                // Own-org workspaces (public or member of)
                {
                    ...(orgId ? { orgId } : {}),
                    OR: [
                        { visibility: VISIBILITY.PUBLIC },
                        {
                            visibility: VISIBILITY.PRIVATE,
                            OR: [
                                { users: { some: { userId } } },
                                { groups: { some: { group: { members: { some: { userId } } } } } }
                            ]
                        }
                    ]
                },
                // Cross-org guest: explicitly invited to workspaces from other orgs
                ...(guestWorkspaceIds.length > 0
                    ? [{ id: { in: guestWorkspaceIds } }]
                    : [])
            ]
        };

        if (includeInactive !== 'true') {
            whereCondition.status = { notIn: ['inactive', 'Inactive'] };
        }

        let workspaces = await prisma.workspace.findMany({
            where: whereCondition,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                users: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, roleRelation: true }
                        }
                    }
                },
                groups: {
                    include: {
                        group: {
                            include: { members: true }
                        }
                    }
                }
            }
        });

        if (workspaces.length > 0) {
            const hasAnyDefault = workspaces.some(w => w.isDefault);
            if (!hasAnyDefault) {
                const oldestWorkspaceId = workspaces.reduce((oldest, current) => {
                    return (new Date(current.createdAt) < new Date(oldest.createdAt)) ? current : oldest;
                }, workspaces[0]).id;
                workspaces = workspaces.map(w => ({
                    ...(w.toJSON ? w.toJSON() : w),
                    isDefault: w.id === oldestWorkspaceId
                }));
            }
        }

        return reply.code(200).send({
            success: true,
            message: 'Workspaces fetched successfully.',
            data: workspaces
        });

    } catch (error) {
        console.error('Error in findAllWorkspaces:', error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findWorkspaceMedia = async (request, reply) => {
    try {
        const { id } = request.params;  //workspace Id
        const { tagIds } = request.query || {};

        // ── Access gate ───────────────────────────────────────────────────────
        const hasAccess = await assertWorkspaceAccess(prisma, request.user, id);
        console.log('hasAccess', hasAccess)
        if (!hasAccess) {
            return reply.code(403).send({
                success: false,
                message: 'You do not have access to this workspace.'
            });
        }

        const workspace = await prisma.workspace.findUnique({ where: { id } });
        if (!workspace) {
            return reply.code(404).send({ success: false, message: 'Workspace not found' });
        }

        if (workspace.status === 'Inactive' || workspace.status === 'inactive') {
            return reply.code(403).send({ success: false, message: 'Workspace is inactive.' });
        }

        const effectivePermissions = await resolveUserWorkspacePermissions(prisma, request.user, workspace);
        // ──────────────────────────────────────────────────────────────────────

        let tagsArray = [];
        if (tagIds) {
            tagsArray = Array.isArray(tagIds) ? tagIds : tagIds.split(',');
        }

        let folders = [];
        let allProjects = [];

        const allWorkspaceFolders = await prisma.folder.findMany({
            where: { workspaceId: id },
            select: { id: true }
        });
        const folderIds = allWorkspaceFolders.map(f => f.id);

        if (tagsArray.length === 0) {
            const pendingFolderIds = await getPendingOrDeletedFolderIds(prisma);
            folders = await prisma.folder.findMany({
                where: {
                    workspaceId: id,
                    parentId: null,
                    ...(pendingFolderIds.length > 0 ? { id: { notIn: pendingFolderIds } } : {})
                },
                include: {
                    sources: true,
                    _count: { select: { children: true, projects: true } }
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            const rootFolderIds = folders.map(f => f.id);
            const folderAssetCounts = rootFolderIds.length > 0 ? await prisma.asset.groupBy({
                by: ['ownerId'],
                where: {
                    ownerType: 'FOLDER',
                    ownerId: { in: rootFolderIds },
                    deletedAt: null,
                    status: { notIn: ['pending_super_admin', 'pending_admin_review', 'trash', 'deleted'] }
                },
                _count: { _all: true }
            }) : [];
            const countMap = new Map(folderAssetCounts.map(c => [String(c.ownerId), c._count._all]));

            folders = folders.map(f => ({
                ...f,
                itemCount: (f._count?.children || 0) + (f._count?.projects || 0) + (countMap.get(String(f.id)) || 0)
            }));

            allProjects = await prisma.project.findMany({
                where: {
                    AND: [
                        { status: { notIn: ['inactive', 'pending_super_admin', 'pending_admin_review', 'trash', 'deleted'] } },
                        {
                            OR: [
                                { workspaceId: id },
                                { folderId: { in: folderIds } }
                            ]
                        },
                        {
                            OR: [
                                { visibility: 'public' },
                                {
                                    visibility: 'private',
                                    OR: [
                                        { users: { some: { userId: request.user.id } } },
                                        { groups: { some: { group: { members: { some: { userId: request.user.id } } } } } }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
        }

        const projects = allProjects;

        return reply.code(200).send({
            success: true,
            message: 'Workspace contents fetched successfully.',
            data: {
                media: [], // Deprecated: Media items are now fetched via the paginated library API
                folders,
                projects,
                allProjects,
                effectivePermissions,
                working: {}
            }
        });

    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.createFolder = async (request, reply) => {
    try {
        const { workspaceId, ownerType } = request.params; // workspace (for now) & Project later 
        const { name, parentId, color, linkedProjectId } = request.body;
        const { orgId, id: userId } = request.user;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name is required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name cannot exceed 100 characters.'
            });
        }

        let targetWorkspaceId = workspaceId;
        let targetParentId = parentId;

        // If creating a folder inside a project, it must reside in the project's parent directory
        if (linkedProjectId) {
            try {
                const project = await prisma.project.findUnique({
                    where: { id: linkedProjectId },
                    select: { ownerType: true, workspaceId: true, folderId: true }
                });
                if (project) {
                    if (project.ownerType === 'WORKSPACE') {
                        // Project is directly inside a workspace
                        targetWorkspaceId = project.workspaceId;
                        if (!parentId) targetParentId = null;
                    } else if (project.ownerType === 'FOLDER') {
                        // Project is inside a folder — new folder goes into that parent folder
                        if (!parentId) targetParentId = project.folderId;
                        // Resolve workspace from project's own workspaceId (already stored)
                        targetWorkspaceId = project.workspaceId;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch project parent info for folder creation:", err);
            }
        }

        // Validate parent folder exists (if provided)
        if (targetParentId) {
            const parentFolder = await prisma.folder.findUnique({
                where: {
                    id: targetParentId,
                },
            });

            if (!parentFolder) {
                return reply.code(404).send({
                    success: false,
                    message: 'Parent folder not found.',
                });
            }

            // OVERRIDE targetWorkspaceId with the parent folder's workspace ID to prevent workspace bleeding
            if (parentFolder.workspaceId) {
                targetWorkspaceId = parentFolder.workspaceId;
            }
        }

        const uniqueName = await generateUniqueWorkspaceName(prisma, targetWorkspaceId, name, 'folder');

        const folder = await prisma.folder.create({
            data: {
                name: uniqueName,
                color,
                parentId: targetParentId,
                workspaceId: targetWorkspaceId,
                ...(linkedProjectId ? {
                    sources: {
                        create: {
                            projectId: linkedProjectId,
                            sourceableType: 'FOLDER'
                        }
                    }
                } : {})
            },
        });
        const itemPath = await buildItemPath(prisma, 'folder', folder.id);
        logSuccess(ACTIVITY_NAME.FOLDER_CREATED, `Folder "${itemPath}" created successfully.`, request);
        return reply.code(201).send({
            success: true,
            message: 'Folder created successfully.',
            data: folder
        });

    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME.FOLDER_CREATED, `Failed to create folder`, request, error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.removeProjectMember = async (request, reply) => {
    try {
        const { projectId, memberId } = request.params;
        await verifyProjectAccess(projectId, request.user.id, 'Full Access');

        await prisma.projectUser.deleteMany({
            where: {
                projectId,
                OR: [
                    { id: memberId },
                    { userId: memberId }
                ]
            }
        });

        await prisma.projectGroup.deleteMany({
            where: {
                projectId,
                OR: [
                    { id: memberId },
                    { groupId: memberId }
                ]
            }
        });

        return reply.send({
            success: true,
            message: 'Project access removed successfully.'
        });
    } catch (error) {
        console.error('Error removing project member:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to remove project member.'
        });
    }
};

module.exports.addProjectMember = async (request, reply) => {
    try {
        const { projectId } = request.params;
        const { email, memberType, accessLevel = 'Full Access', groupId, sendInviteEmail = false } = request.body;

        await verifyProjectAccess(projectId, request.user.id, 'Full Access');

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { workspace: { include: { organization: true } } }
        });

        if (!project) {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }

        const inviterName = request.user?.name || request.user?.email || 'A team member';
        const orgId = request.user?.orgId;
        const appUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");

        if (groupId) {
            const group = await prisma.userGroup.findUnique({
                where: { id: groupId },
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, email: true, orgId: true } }
                        }
                    }
                }
            });
            if (!group) {
                return reply.code(404).send({ success: false, message: 'Group not found.' });
            }
            await prisma.projectGroup.create({
                data: {
                    projectId,
                    groupId: group.id,
                    accessLevel: accessLevel || 'Full Access',
                }
            }).catch(() => { });

            if (Array.isArray(group.members)) {
                for (const memberRecord of group.members) {
                    const memberUser = memberRecord?.user;
                    if (memberUser && memberUser.id !== request.user.id) {
                        // ALWAYS send in-app notification
                        createNotification(
                            request.server,
                            memberUser.id,
                            memberUser.orgId || orgId,
                            'project_invite',
                            'Invited to project',
                            `${inviterName} added group "${group.name || 'your group'}" to project "${project.name}"`,
                            project.id
                        ).catch(err => console.error('Failed to create in-app notification for group member:', err));

                        // Send email only if sendInviteEmail is checked
                        if (sendInviteEmail && memberUser.email) {
                            const orgBranding = await resolveOrgBranding(prisma, memberUser.orgId || orgId, { forEmail: true });
                            emailService.sendProjectMemberInvite(memberUser.email, {
                                projectName: project.name,
                                inviterName,
                                appUrl: `${appUrl.replace(/\/$/, '')}/home`,
                                orgLogoUrl: orgBranding?.logoUrl,
                                orgName: orgBranding?.accountName,
                            }).catch(err => console.error('Failed to send group member invite email:', err));
                        }
                    }
                }
            }

            return reply.send({ success: true, message: 'Group added to project.' });
        }

        if (!email) {
            return reply.code(400).send({ success: false, message: 'Email or group is required.' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

        if (!user) {
            return reply.code(404).send({ success: false, message: 'User not found.', notFound: true });
        }

        const effectiveMemberType = user.orgId === orgId ? MEMBER_TYPES.MEMBER : MEMBER_TYPES.GUEST;

        let resolvedAccessLevelId = null;
        if (accessLevel) {
            const lvl = await prisma.accessLevel.findFirst({ where: { title: accessLevel } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        } else {
            const lvl = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        }

        await prisma.projectUser.upsert({
            where: { projectId_userId: { projectId, userId: user.id } },
            update: {
                accessLevelId: resolvedAccessLevelId,
                memberType: effectiveMemberType
            },
            create: {
                projectId,
                userId: user.id,
                accessLevelId: resolvedAccessLevelId,
                memberType: effectiveMemberType,
            }
        }).catch((err) => { console.error("Failed to add project member:", err) });

        // ALWAYS send in-app notification
        createNotification(
            request.server,
            user.id,
            user.orgId || orgId,
            'project_invite',
            'Invited to project',
            `${inviterName} added you to project "${project.name}"`,
            project.id
        ).catch(err => console.error('Failed to create in-app notification for added user:', err));

        // Fire email ONLY if sendInviteEmail is true
        if (sendInviteEmail) {
            try {
                const orgBranding = await resolveOrgBranding(prisma, user.orgId || orgId || project.workspace?.orgId, { forEmail: true });
                const orgName = orgBranding?.accountName || project.workspace?.organization?.name || 'Noah Cloud';
                if (effectiveMemberType?.toUpperCase() === MEMBER_TYPES.GUEST) {
                    await emailService.sendProjectGuestInvite(user.email, {
                        projectName: project.name,
                        organizationName: orgName,
                        appUrl: `${appUrl.replace(/\/$/, '')}/home`,
                        orgLogoUrl: orgBranding?.logoUrl,
                    }).catch(err => console.error('Failed to send guest invite email:', err));
                } else {
                    await emailService.sendProjectMemberInvite(user.email, {
                        projectName: project.name,
                        inviterName,
                        appUrl: `${appUrl.replace(/\/$/, '')}/home`,
                        orgLogoUrl: orgBranding?.logoUrl,
                        orgName: orgBranding?.accountName,
                    }).catch(err => console.error('Failed to send member invite email:', err));
                }
            } catch (e) {
                console.error('Failed to send project invite email:', e);
            }
        }

        return reply.send({
            success: true,
            message: `${effectiveMemberType} added to project successfully.`,
            memberType: effectiveMemberType,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl
            }
        });
    } catch (error) {
        console.error('Error adding project member:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to add project member.'
        });
    }
};

module.exports.updateProjectMemberAccess = async (request, reply) => {
    try {
        const { projectId, memberId } = request.params;
        const { accessLevel } = request.body;

        await verifyProjectAccess(projectId, request.user.id, 'Full Access');

        await prisma.projectUser.updateMany({
            where: {
                projectId,
                OR: [
                    { id: memberId },
                    { userId: memberId }
                ]
            },
            data: { accessLevel }
        });

        await prisma.projectGroup.updateMany({
            where: {
                projectId,
                OR: [
                    { id: memberId },
                    { groupId: memberId }
                ]
            },
            data: { accessLevel }
        });

        return reply.send({
            success: true,
            message: 'Member access level updated successfully.'
        });
    } catch (error) {
        console.error('Error updating project member access:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to update member access.'
        });
    }
};

module.exports.createProject = async (request, reply) => {
    try {
        const { workspaceId } = request.params;
        const { name, folderId, defaultTagIds, visibility = 'public', inviteEmails = [], inviteGroupIds = [], inviteAccess = 'Full Access', inviteMemberType = MEMBER_TYPES.MEMBER, sendInviteEmail = false } = request.body;
        const { orgId, id: userId } = request.user;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Project name is required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Project name cannot exceed 100 characters.'
            });
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { currentPlan: true }
        });
        const maxProjects = org?.currentPlan?.maxProjects ?? org?.maxProjects ?? 1;
        const currentProjectCount = await prisma.project.count({
            where: { workspace: { orgId } }
        });
        if (currentProjectCount >= maxProjects) {
            return reply.code(403).send({
                success: false,
                message: `Project limit (${maxProjects}) reached for your current plan. Please upgrade to create more projects.`
            });
        }

        // Validate guest emails: must be registered on platform but from a DIFFERENT organization
        if (visibility.toLowerCase() === VISIBILITY.PRIVATE && inviteMemberType?.toUpperCase() === MEMBER_TYPES.GUEST && Array.isArray(inviteEmails) && inviteEmails.length > 0) {
            for (const email of inviteEmails) {
                if (!email || typeof email !== 'string') continue;
                const cleanEmail = email.toLowerCase().trim();
                const guestUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
                if (!guestUser) {
                    return reply.code(400).send({
                        success: false,
                        message: `User with email ${cleanEmail} is not registered on this platform.`
                    });
                }
                if (guestUser.orgId === orgId) {
                    return reply.code(400).send({
                        success: false,
                        message: `${cleanEmail} is already a member of your organization. Use "Member" instead of "Guest".`
                    });
                }
            }
        }

        let finalFolderId = folderId;
        let finalOwnerType = folderId ? 'FOLDER' : 'WORKSPACE';
        let resolvedFolderName = null;

        if (!folderId) {
            // Determine year and month folders
            const tzSetting = await prisma.systemTimezone.findFirst({
                where: { type: 'workspace', enabled: true }
            });
            const timeZone = tzSetting ? tzSetting.timezone : 'Europe/London';

            const now = new Date();
            const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(now);
            const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone }).format(now);

            // 1. Find or create Year folder
            let yearFolder = await prisma.folder.findFirst({
                where: { workspaceId, name: year, parentId: null }
            });

            if (!yearFolder) {
                yearFolder = await prisma.folder.create({
                    data: { name: year, workspaceId, parentId: null, isAutoGenerated: true }
                });
            }

            // 2. Find or create Month folder
            let monthFolder = await prisma.folder.findFirst({
                where: { workspaceId, name: month, parentId: yearFolder.id }
            });

            if (!monthFolder) {
                monthFolder = await prisma.folder.create({
                    data: { name: month, workspaceId, parentId: yearFolder.id, isAutoGenerated: true }
                });
            }

            finalFolderId = monthFolder.id;
            finalOwnerType = 'FOLDER';
            resolvedFolderName = monthFolder.name;
        }

        const uniqueName = await generateUniqueWorkspaceName(prisma, workspaceId, name, 'project');

        const project = await prisma.project.create({
            data: {
                name: uniqueName,
                ownerType: finalOwnerType,
                workspaceId,
                folderId: finalFolderId || null,
                visibility: visibility.toLowerCase(),
                createdById: userId || null,
            },
        });

        // If visibility is private, handle project invites
        if (visibility.toLowerCase() === VISIBILITY.PRIVATE) {

            // Get full access ID for the creator
            let fullAccessId = null;
            const fullAccessLvl = await prisma.accessLevel.findFirst({ where: { name: ACCESS_LEVEL.FULL_ACCESS } });
            if (fullAccessLvl) fullAccessId = fullAccessLvl.id;

            // Resolve inviteAccess ID for invitees
            let resolvedInviteAccessId = fullAccessId;
            if (inviteAccess) {
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteAccess)) {
                    resolvedInviteAccessId = inviteAccess;
                } else {
                    const lvl = await prisma.accessLevel.findFirst({ where: { title: inviteAccess } });
                    if (lvl) resolvedInviteAccessId = lvl.id;
                }
            }

            // Add the creator as Full Access
            if (userId && fullAccessId) {
                await prisma.projectUser.create({
                    data: {
                        projectId: project.id,
                        userId: userId,
                        accessLevelId: fullAccessId,
                        memberType: MEMBER_TYPES.OWNER,
                    }
                }).catch(() => { });
            }

            // Also auto-assign admins/owners for private projects
            await autoAssignAdminsToProject(prisma, request.user.orgId, workspaceId, project.id);

            // Add invited emails
            if (Array.isArray(inviteEmails) && inviteEmails.length > 0) {
                const appUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");
                const inviterName = request.user?.name || request.user?.email || 'A team member';

                for (const email of inviteEmails) {
                    if (!email || typeof email !== 'string') continue;
                    const cleanEmail = email.toLowerCase().trim();

                    if (inviteMemberType?.toUpperCase() === MEMBER_TYPES.GUEST) {
                        // GUEST FLOW: Require user to exist globally, then create ProjectUser and send normal invite
                        let invitedUser = await prisma.user.findUnique({
                            where: { email: cleanEmail }
                        });

                        if (invitedUser && invitedUser.id !== userId && resolvedInviteAccessId) {
                            await prisma.projectUser.create({
                                data: {
                                    projectId: project.id,
                                    userId: invitedUser.id,
                                    accessLevelId: resolvedInviteAccessId,
                                    memberType: inviteMemberType,
                                }
                            }).catch(() => { });

                            // ALWAYS send in-app notification
                            createNotification(
                                request.server,
                                invitedUser.id,
                                invitedUser.orgId || orgId,
                                'project_invite',
                                'Invited to project',
                                `${inviterName} added you to project "${project.name}"`,
                                project.id
                            ).catch(err => console.error('Failed to create in-app notification for guest:', err));

                            // Fire non-blocking email only if sendInviteEmail is true
                            if (sendInviteEmail) {
                                const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
                                const orgBranding = await resolveOrgBranding(prisma, orgId, { forEmail: true });
                                const organizationName = orgBranding?.accountName || (org ? org.name : 'An organization');

                                emailService.sendProjectGuestInvite(cleanEmail, {
                                    projectName: project.name,
                                    organizationName,
                                    appUrl: `${appUrl.replace(/\/$/, '')}/home`,
                                    orgLogoUrl: orgBranding?.logoUrl,
                                }).catch(err => console.error('Failed to send guest invite:', err));
                            }
                        }
                    } else {
                        // MEMBER FLOW: Require user to exist in org, then create ProjectUser and send normal invite
                        let invitedUser = await prisma.user.findFirst({
                            where: { email: cleanEmail, orgId }
                        });

                        if (invitedUser && invitedUser.id !== userId && resolvedInviteAccessId) {
                            await prisma.projectUser.create({
                                data: {
                                    projectId: project.id,
                                    userId: invitedUser.id,
                                    accessLevelId: resolvedInviteAccessId,
                                    memberType: inviteMemberType,
                                }
                            }).catch(() => { });

                            // ALWAYS send in-app notification
                            createNotification(
                                request.server,
                                invitedUser.id,
                                orgId,
                                'project_invite',
                                'Invited to project',
                                `${inviterName} added you to project "${project.name}"`,
                                project.id
                            ).catch(err => console.error('Failed to create in-app notification for member:', err));

                            // Fire non-blocking email only if sendInviteEmail is true
                            if (sendInviteEmail) {
                                const orgBranding = await resolveOrgBranding(prisma, orgId, { forEmail: true });
                                emailService.sendProjectMemberInvite(cleanEmail, {
                                    projectName: project.name,
                                    inviterName,
                                    appUrl: `${appUrl.replace(/\/$/, '')}/home`,
                                    orgLogoUrl: orgBranding?.logoUrl,
                                    orgName: orgBranding?.accountName,
                                }).catch(err => console.error('Failed to send member invite:', err));
                            }
                        }
                    }
                }
            }

            // Add invited groups
            if (Array.isArray(inviteGroupIds) && inviteGroupIds.length > 0 && resolvedInviteAccessId) {
                const appUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");
                const inviterName = request.user?.name || request.user?.email || 'A team member';

                for (const groupId of inviteGroupIds) {
                    await prisma.projectGroup.create({
                        data: {
                            projectId: project.id,
                            groupId: groupId,
                            accessLevelId: resolvedInviteAccessId,
                        }
                    }).catch(() => { });

                    const group = await prisma.userGroup.findUnique({
                        where: { id: groupId },
                        include: {
                            members: {
                                include: {
                                    user: { select: { id: true, email: true, orgId: true } }
                                }
                            }
                        }
                    });

                    if (group && Array.isArray(group.members)) {
                        for (const memberRecord of group.members) {
                            const memberUser = memberRecord?.user;
                            if (memberUser && memberUser.id !== userId) {
                                // ALWAYS send in-app notification
                                createNotification(
                                    request.server,
                                    memberUser.id,
                                    memberUser.orgId || orgId,
                                    'project_invite',
                                    'Invited to project',
                                    `${inviterName} added group "${group.name || 'your group'}" to project "${project.name}"`,
                                    project.id
                                ).catch(err => console.error('Failed to create in-app notification for group member:', err));

                                // Send email to group member only if sendInviteEmail is checked
                                if (sendInviteEmail && memberUser.email) {
                                    const orgBranding = await resolveOrgBranding(prisma, memberUser.orgId || orgId, { forEmail: true });
                                    emailService.sendProjectMemberInvite(memberUser.email, {
                                        projectName: project.name,
                                        inviterName,
                                        appUrl: `${appUrl.replace(/\/$/, '')}/home`,
                                        orgLogoUrl: orgBranding?.logoUrl,
                                        orgName: orgBranding?.accountName,
                                    }).catch(err => console.error('Failed to send group member invite:', err));
                                }
                            }
                        }
                    }
                }
            }
        }

        const tagIds = Array.isArray(defaultTagIds) ? defaultTagIds : [];
        if (tagIds.length > 0) {
            // Validate all tags belong to this org
            const validTags = await prisma.tag.findMany({
                where: { id: { in: tagIds }, orgId },
                select: { id: true },
            });
            const validTagIds = validTags.map(t => t.id);

            if (validTagIds.length > 0) {
                await prisma.projectTag.createMany({
                    data: validTagIds.map(tagId => ({
                        projectId: project.id,
                        tagId,
                        addedById: userId,
                    })),
                    skipDuplicates: true,
                });
            }
        }
        const itemPath = await buildItemPath(prisma, 'project', project.id);
        logSuccess(ACTIVITY_NAME.PROJECT_CREATED, `Project "${itemPath}" created successfully.`, request);
        return reply.code(201).send({
            success: true,
            message: 'Project created successfully.',
            data: project,
            folderId: finalFolderId,
            folderName: resolvedFolderName
        });

    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME.PROJECT_CREATED, `Failed to create project`, request, error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};
module.exports.findAllProjects = async (request, reply) => {
    try {
        const liveUser = await prisma.user.findUnique({
            where: { id: request.user.id },
            include: { roleRelation: true }
        });
        const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || request.user.role || 'Viewer';
        const userRole = rawRoleName.trim().toLowerCase();
        const isAdmin = userRole === 'super admin' || userRole === 'superadmin' || userRole === 'admin';
        const orgId = liveUser?.orgId || request.user?.orgId;
        const userId = request.user.id;

        const projects = await prisma.project.findMany({
            where: {
                workspace: {
                    orgId
                },
                status: { notIn: ['pending_super_admin', 'pending_admin_review', 'trash', 'deleted'] },
                ...(isAdmin ? {} : {
                    status: 'active',
                    OR: [
                        { visibility: VISIBILITY.PUBLIC },
                        {
                            visibility: VISIBILITY.PRIVATE,
                            OR: [
                                { users: { some: { userId } } },
                                { groups: { some: { group: { members: { some: { userId } } } } } }
                            ]
                        }
                    ]
                })
            },
            include: {
                workspace: {
                    select: { id: true, name: true }
                },
                createdBy: {
                    select: { id: true, name: true, email: true }
                },
                users: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, avatarUrl: true }
                        }
                    }
                },
                groups: {
                    include: {
                        group: {
                            select: { id: true, name: true }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return reply.code(200).send({
            success: true,
            data: projects
        });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findFolderData = async (request, reply) => {
    try {
        const { id } = request.params; // folderId
        const { projectId } = request.query;

        const folderInfo = await prisma.folder.findUnique({
            where: { id },
            include: { sources: true }
        });

        if (!folderInfo) {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }

        let effectivePermissions = undefined;
        if (projectId && request.user) {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: { workspace: true }
            });
            if (project) {
                const { resolveUserProjectPermissions } = require('../lib/rbac-policy');
                effectivePermissions = await resolveUserProjectPermissions(prisma, request.user, project);
            }
        } else if (folderInfo.workspaceId && request.user) {
            const workspace = await prisma.workspace.findUnique({ where: { id: folderInfo.workspaceId } });
            if (workspace) {
                const { resolveUserWorkspacePermissions } = require('../lib/rbac-policy');
                effectivePermissions = await resolveUserWorkspacePermissions(prisma, request.user, workspace);
            }
        }

        const pendingFolderIds = await getPendingOrDeletedFolderIds(prisma);
        let folders = await prisma.folder.findMany({
            where: {
                parentId: id,
                ...(pendingFolderIds.length > 0 ? { id: { notIn: pendingFolderIds } } : {})
            },
            include: {
                sources: true,
                _count: { select: { children: true, projects: true } }
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const rootFolderIds = folders.map(f => f.id);
        const folderAssetCounts = rootFolderIds.length > 0 ? await prisma.asset.groupBy({
            by: ['ownerId'],
            where: {
                ownerType: 'FOLDER',
                ownerId: { in: rootFolderIds },
                deletedAt: null,
                status: { notIn: ['pending_super_admin', 'pending_admin_review', 'trash', 'deleted'] }
            },
            _count: { _all: true }
        }) : [];
        const countMap = new Map(folderAssetCounts.map(c => [String(c.ownerId), c._count._all]));

        folders = folders.map(f => ({
            ...f,
            itemCount: (f._count?.children || 0) + (f._count?.projects || 0) + (countMap.get(String(f.id)) || 0)
        }));

        const projects = await prisma.project.findMany({
            where: {
                status: { notIn: ['inactive', 'pending_super_admin', 'pending_admin_review', 'trash', 'deleted'] },
                ownerType: 'FOLDER',
                folderId: id,
                OR: [
                    { visibility: 'public' },
                    {
                        visibility: 'private',
                        OR: [
                            { users: { some: { userId: request.user.id } } },
                            { groups: { some: { group: { members: { some: { userId: request.user.id } } } } } }
                        ]
                    }
                ]
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return reply.code(200).send({
            success: true,
            message: 'Folder contents fetched successfully.',
            data: {
                folderInfo,
                media: [], // Deprecated: fetched via pagination API
                folders,
                projects,
                effectivePermissions: effectivePermissions || []
            }
        });

    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findFolderTreeData = async (request, reply) => {
    try {
        const { id } = request.params; // folderId

        const rootFolder = await prisma.folder.findUnique({
            where: { id },
            select: { id: true, name: true, workspaceId: true, parentId: true }
        });

        if (!rootFolder) {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }

        // Recursively find all subfolder IDs under rootFolder
        const allFolderIds = new Set([id]);
        let currentFolderLevel = [id];
        while (currentFolderLevel.length > 0) {
            const childFolders = await prisma.folder.findMany({
                where: { parentId: { in: currentFolderLevel } },
                select: { id: true }
            }).catch(() => []);
            const childIds = childFolders.map(f => f.id).filter(fId => !allFolderIds.has(fId));
            if (childIds.length === 0) break;
            childIds.forEach(fId => allFolderIds.add(fId));
            currentFolderLevel = childIds;
        }

        const folderIdList = Array.from(allFolderIds);

        // Fetch all subfolder records
        const allFolders = await prisma.folder.findMany({
            where: { id: { in: folderIdList } },
            select: { id: true, name: true, parentId: true }
        });

        // Fetch all media assets inside these folders or marked deleted with this folderId (excluding globalMedia and placeholder folder assets)
        const allAssets = await prisma.asset.findMany({
            where: {
                type: { not: 'folder' },
                status: { notIn: ['trash', 'deleted'] },
                globalMedia: false,
                OR: [
                    { ownerId: { in: folderIdList } },
                    { collectionAssets: { some: { collectionId: { in: folderIdList } } } },
                    { sources: { some: { folderId: { in: folderIdList } } } },
                    { deletionReason: { contains: id } }
                ]
            },
            select: { id: true, title: true, type: true, ownerType: true, ownerId: true, deletionReason: true }
        }).catch(() => []);

        // Fetch all projects inside these folders
        const allProjects = await prisma.project.findMany({
            where: {
                status: { notIn: ['inactive', 'trash', 'deleted'] },
                folderId: { in: folderIdList }
            },
            select: { id: true, name: true, folderId: true }
        }).catch(() => []);

        return reply.code(200).send({
            success: true,
            data: {
                folderInfo: rootFolder,
                folders: allFolders,
                projects: allProjects,
                media: allAssets
            }
        });
    } catch (error) {
        console.error('Error fetching folder tree data:', error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Helper function to handle unselected folders and files when a parent folder or project is permanently deleted by Super Admin.
 * - Creates or reuses a single "Restore" folder at top level of the workspace.
 * - Moves top-most unselected folders (whose parent is deleted) into "Restore" folder.
 * - Moves top-most unselected files (whose parent folder is deleted) into "Restore" folder.
 * - Leaves nested unselected items inside their unselected parent folder.
 * - Clears deletion status/fields for all unselected items to make them active again.
 */
async function handleUnselectedItemsPreservation(prisma, { workspaceId, targetFolderIds, finalAssetIdsToDelete, allFolderIds, allFolderAssets }) {
    if (!workspaceId) return;

    const deletedFolderIdSet = new Set(targetFolderIds || []);
    const deletedAssetIdSet = new Set(finalAssetIdsToDelete || []);

    const unselectedFolderIds = (allFolderIds || []).filter(fId => !deletedFolderIdSet.has(fId));
    const unselectedAssetIds = (allFolderAssets || [])
        .filter(a => a.type !== 'folder' && !deletedAssetIdSet.has(a.id))
        .map(a => a.id);

    if (unselectedFolderIds.length === 0 && unselectedAssetIds.length === 0) {
        return;
    }

    // 1. Get or Create "Restore" folder in this workspace
    let restoreFolder = await prisma.folder.findFirst({
        where: {
            workspaceId: workspaceId,
            parentId: null,
            name: 'Restore'
        }
    }).catch(() => null);

    if (!restoreFolder) {
        restoreFolder = await prisma.folder.create({
            data: {
                name: 'Restore',
                workspaceId: workspaceId,
                parentId: null,
                color: '#3b82f6'
            }
        }).catch(() => null);
    }

    if (!restoreFolder) {
        console.error('[Restore Folder Error] Could not find or create Restore folder');
        return;
    }

    // 2. Process Unselected Folders
    if (unselectedFolderIds.length > 0) {
        const unselectedFolders = await prisma.folder.findMany({
            where: { id: { in: unselectedFolderIds } }
        }).catch(() => []);

        for (const folder of unselectedFolders) {
            // Check if folder's parent is deleted (or root being deleted)
            const isParentDeleted = !folder.parentId || deletedFolderIdSet.has(folder.parentId);
            if (isParentDeleted) {
                // Top-most unselected folder: Move to Restore folder
                await prisma.folder.update({
                    where: { id: folder.id },
                    data: { parentId: restoreFolder.id }
                }).catch(() => null);
            }
        }
    }

    // 3. Process Unselected Assets
    if (unselectedAssetIds.length > 0) {
        const unselectedAssets = (allFolderAssets || []).filter(a => unselectedAssetIds.includes(a.id));

        for (const asset of unselectedAssets) {
            // Extract parent folder ID of asset
            let parentFolderId = asset.ownerType === 'FOLDER' ? asset.ownerId : (asset.folderId || null);
            if (!parentFolderId && asset.deletionReason) {
                const match = asset.deletionReason.match(/Deleted with folder:\s*\[([0-9a-fA-F-]+)\]/i);
                if (match) parentFolderId = match[1];
            }

            const isParentDeleted = !parentFolderId || deletedFolderIdSet.has(parentFolderId);

            if (isParentDeleted) {
                // Top-most unselected asset: Move to Restore folder & reactivate
                await prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        status: 'active',
                        deletedAt: null,
                        deletedByUserId: null,
                        deletionReason: null,
                        ownerType: 'FOLDER',
                        ownerId: restoreFolder.id,
                        workspaceId: workspaceId
                    }
                }).catch(() => null);
            } else {
                // Asset parent folder is preserved: Keep inside its parent folder & reactivate
                await prisma.asset.update({
                    where: { id: asset.id },
                    data: {
                        status: 'active',
                        deletedAt: null,
                        deletedByUserId: null,
                        deletionReason: null
                    }
                }).catch(() => null);
            }
        }
    }
}

module.exports.deleteFolder = async (request, reply) => {
    try {
        const { id } = request.params; // folderId
        const { isWholeFolder = false, deleteFileIds = [], deleteFolderIds = [], deletionReason, isPermanent = false } = request.body || {};

        const liveUser = await prisma.user.findUnique({
            where: { id: request.user.id },
            include: { roleRelation: true }
        });
        const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
        const userRole = rawRoleName.trim().toLowerCase();
        const roleId = liveUser?.roleId || request.user?.roleId;

        const isSuperAdmin =
            userRole === 'super admin' ||
            userRole === 'superadmin' ||
            userRole === 'super_admin' ||
            roleId === '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15';

        const isAdmin =
            userRole === 'admin' ||
            roleId === '88a6b2a1-b2f6-40d5-8b04-4abf7eb45401' ||
            isSuperAdmin;

        if (!isAdmin) {
            return reply.code(403).send({
                success: false,
                error: 'Forbidden',
                message: 'Only Super Admin and Admin roles are authorized to delete folders.'
            });
        }

        const targetFolder = await prisma.folder.findUnique({
            where: { id },
            include: { workspace: true }
        }).catch(() => null);

        if (targetFolder && targetFolder.name && targetFolder.name.trim().toLowerCase() === 'restore') {
            return reply.code(400).send({
                success: false,
                error: 'BadRequest',
                message: 'The Restore folder is a protected system folder and cannot be deleted.'
            });
        }

        const folderName = targetFolder?.name || 'Folder';
        const itemPath = await buildItemPath(prisma, 'folder', id);
        const orgId = liveUser?.orgId || targetFolder?.workspace?.orgId || request.user?.orgId;
        const userName = liveUser?.name || liveUser?.email || 'User';

        // Collect all subfolder IDs under targetFolder recursively
        const allSubfolderIds = new Set([id]);
        let currentLevel = [id];
        while (currentLevel.length > 0) {
            const childFolders = await prisma.folder.findMany({
                where: { parentId: { in: currentLevel } },
                select: { id: true }
            }).catch(() => []);
            const childIds = childFolders.map(f => f.id).filter(fId => !allSubfolderIds.has(fId));
            if (childIds.length === 0) break;
            childIds.forEach(fId => allSubfolderIds.add(fId));
            currentLevel = childIds;
        }

        const folderIdList = Array.from(allSubfolderIds);

        // All assets owned by these folders or marked with deletionReason containing this folderId (excluding globalMedia)
        const allFolderAssets = await prisma.asset.findMany({
            where: {
                globalMedia: false,
                OR: [
                    { ownerType: 'FOLDER', ownerId: { in: folderIdList } },
                    { deletionReason: { contains: id } },
                    { collectionAssets: { some: { collectionId: { in: folderIdList } } } },
                    { sources: { some: { folderId: { in: folderIdList } } } },
                    ...(targetFolder?.workspaceId ? [{ workspaceId: targetFolder.workspaceId, ownerId: { in: folderIdList } }] : [])
                ]
            },
            include: {
                files: true,
                collectionAssets: true,
                sources: true
            }
        }).catch(() => []);

        if (isSuperAdmin && isPermanent) {
            // Direct Permanent Delete by Super Admin
            const targetAssetIds = (isWholeFolder || (!deleteFileIds.length && !deleteFolderIds.length))
                ? allFolderAssets.map(a => a.id)
                : Array.from(new Set(deleteFileIds || []));

            const targetFolderIds = (isWholeFolder || (!deleteFileIds.length && !deleteFolderIds.length))
                ? folderIdList
                : Array.from(new Set(deleteFolderIds || []));

            const assetsToDelete = allFolderAssets.filter(a => targetAssetIds.includes(a.id) || (isWholeFolder && a.deletionReason && a.deletionReason.includes(id)));
            const finalAssetIdsToDelete = Array.from(new Set(assetsToDelete.map(a => a.id)));

            const workspaceId = targetFolder?.workspaceId || liveUser?.workspaceId;

            // Purge temporary placeholder folder assets for this folder request first
            await prisma.asset.deleteMany({
                where: {
                    type: 'folder',
                    OR: [
                        { ownerId: { in: folderIdList } },
                        { deletionReason: { contains: id } }
                    ]
                }
            }).catch(() => null);

            // Preserve unselected items and move top-most unselected items to Restore folder if parent deleted
            await handleUnselectedItemsPreservation(prisma, {
                workspaceId,
                targetFolderIds,
                finalAssetIdsToDelete,
                allFolderIds: folderIdList,
                allFolderAssets: allFolderAssets.filter(a => a.type !== 'folder')
            });

            for (const asset of assetsToDelete) {
                let assetSizeBytes = 0;
                if (asset.files && asset.files.length > 0) {
                    for (const f of asset.files) {
                        assetSizeBytes += Number(f.sizeBytes || 0);
                        if (f.filePath && (await b2()).isEnabled()) {
                            try {
                                await (await b2()).deleteFile(f.filePath);
                                await (await b2()).permanentlyDeleteFile(f.filePath);
                            } catch (b2Err) {
                                console.warn(`[Permanent Delete] Could not delete B2 key ${f.filePath}:`, b2Err.message);
                            }
                        }
                    }
                }

                if (assetSizeBytes > 0 && (asset.orgId || orgId)) {
                    try {
                        await recordStorageDelta(prisma, {
                            orgId: asset.orgId || orgId,
                            deltaBytes: -assetSizeBytes,
                            assetId: asset.id,
                            reason: 'permanent_delete',
                        });
                    } catch (dErr) {
                        console.warn('Failed to record storage delta:', dErr.message);
                    }
                }
            }

            if (finalAssetIdsToDelete.length > 0) {
                await prisma.assetFile.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.assetMetadata.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.assetTag.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.assetUser.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.assetGroup.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.collectionAsset.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.annotation.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.projectSource.deleteMany({ where: { assetId: { in: finalAssetIdsToDelete } } }).catch(() => null);
                await prisma.asset.deleteMany({ where: { id: { in: finalAssetIdsToDelete } } }).catch(() => null);
            }

            if (targetFolderIds.length > 0) {
                await prisma.projectSource.deleteMany({ where: { folderId: { in: targetFolderIds } } }).catch(() => null);
                await prisma.folderUser.deleteMany({ where: { folderId: { in: targetFolderIds } } }).catch(() => null);
                await prisma.favorite.deleteMany({ where: { folderId: { in: targetFolderIds } } }).catch(() => null);
                await prisma.folder.deleteMany({ where: { id: { in: targetFolderIds } } }).catch(() => null);
            }

            // Restore any unselected assets back to active status
            const unselectedAssets = allFolderAssets.filter(a => !finalAssetIdsToDelete.includes(a.id));
            const unselectedAssetIds = unselectedAssets.map(a => a.id);

            if (unselectedAssetIds.length > 0) {
                await prisma.asset.updateMany({
                    where: { id: { in: unselectedAssetIds } },
                    data: {
                        status: 'active',
                        deletedAt: null,
                        deletedByUserId: null,
                        deletionReason: null
                    }
                }).catch(() => null);
            }

            // Clean up placeholder assets & remaining pending_super_admin assets for this folder request
            await prisma.asset.deleteMany({
                where: {
                    type: 'folder',
                    ownerId: id,
                    status: 'pending_super_admin'
                }
            }).catch(() => null);

            await prisma.asset.updateMany({
                where: {
                    deletionReason: { contains: id },
                    status: 'pending_super_admin'
                },
                data: {
                    status: 'active',
                    deletedAt: null,
                    deletedByUserId: null,
                    deletionReason: null
                }
            }).catch(() => null);
            logSuccess(ACTIVITY_NAME.FOLDER_DELETED, `Folder "${itemPath}" deletion processed cleanly.`, request);
            return reply.code(200).send({
                success: true,
                message: 'Folder deletion processed cleanly.'
            });
        } else {
            // Admin deletion request (pending_super_admin status)
            let assetsToMark = [];
            if (isWholeFolder) {
                assetsToMark = allFolderAssets;
            } else {
                const selectedFileIdSet = new Set(deleteFileIds || []);
                const selectedFolderIdSet = new Set(deleteFolderIds || []);

                assetsToMark = allFolderAssets.filter(a => {
                    if (selectedFileIdSet.has(a.id)) return true;
                    if (a.ownerId && selectedFolderIdSet.has(a.ownerId)) return true;
                    if (a.collectionAssets && a.collectionAssets.some(ca => selectedFolderIdSet.has(ca.collectionId))) return true;
                    if (a.sources && a.sources.some(s => selectedFolderIdSet.has(s.folderId))) return true;
                    return false;
                });

                // Fallback: If no asset matched specific selection, mark all assets in the folder
                if (assetsToMark.length === 0 && allFolderAssets.length > 0) {
                    assetsToMark = allFolderAssets;
                }
            }

            let targetAssetIds = Array.from(new Set(assetsToMark.map(a => a.id)));
            const validUserId = liveUser?.id || request.user?.id || request.user?.userId;
            const folderReason = deletionReason || `Deleted with folder: [${id}] ${folderName}`;

            if (targetAssetIds.length > 0) {
                await prisma.asset.updateMany({
                    where: { id: { in: targetAssetIds } },
                    data: {
                        status: 'pending_super_admin',
                        deletedAt: new Date(),
                        ...(validUserId ? { deletedByUserId: validUserId } : {}),
                        deletionReason: folderReason
                    }
                });
            }

            // Always create/update a FOLDER placeholder asset for Super Admin Delete Management tracking
            try {
                const existingReq = await prisma.asset.findFirst({
                    where: { ownerType: 'FOLDER', ownerId: id, type: 'folder' }
                }).catch(() => null);

                if (existingReq) {
                    await prisma.asset.update({
                        where: { id: existingReq.id },
                        data: {
                            status: 'pending_super_admin',
                            deletedAt: new Date(),
                            ...(validUserId ? { deletedByUserId: validUserId } : {}),
                            deletionReason: folderReason
                        }
                    });
                } else {
                    await prisma.asset.create({
                        data: {
                            orgId: orgId || request.user?.orgId,
                            title: folderName,
                            type: 'folder',
                            status: 'pending_super_admin',
                            visibility: 'public',
                            ownerType: 'FOLDER',
                            ownerId: id,
                            workspaceId: targetFolder.workspaceId,
                            deletedAt: new Date(),
                            ...(validUserId ? { deletedByUserId: validUserId } : {}),
                            deletionReason: folderReason
                        }
                    });
                }
            } catch (phErr) {
                console.warn('Failed to create/update folder deletion placeholder asset:', phErr.message);
            }

            // Also delete subfolders if specific subfolders were deleted
            if (!isWholeFolder && deleteFolderIds && deleteFolderIds.length > 0) {
                const subfolderIdsToDelete = deleteFolderIds.filter(fId => fId !== id);
                if (subfolderIdsToDelete.length > 0) {
                    await prisma.folder.deleteMany({ where: { id: { in: subfolderIdsToDelete } } }).catch(() => null);
                }
            }

            await notifyRole(request.server, orgId, 'Super Admin', 'approval_request', 'Folder Deletion Request', `${userName} (${rawRoleName}) requested folder deletion for '${folderName}'.`, id);

            logSuccess(ACTIVITY_NAME.FOLDER_DELETED, `Admin requested folder deletion for "${itemPath}". Submitted for Super Admin review.`, request);

            return reply.code(200).send({
                success: true,
                message: 'Folder deletion request submitted for Super Admin review.'
            });
        }
    } catch (error) {
        console.error('Error in deleteFolder controller:', error);
        logError(ACTIVITY_NAME.FOLDER_DELETED, `Failed to delete folder`, request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.restoreFolder = async (request, reply) => {
    try {
        const { id } = request.params; // folderId

        const allFolderIds = new Set([id]);
        let currentFolderLevel = [id];
        while (currentFolderLevel.length > 0) {
            const childFolders = await prisma.folder.findMany({
                where: { parentId: { in: currentFolderLevel } },
                select: { id: true }
            }).catch(() => []);
            const childIds = childFolders.map(f => f.id).filter(fId => !allFolderIds.has(fId));
            if (childIds.length === 0) break;
            childIds.forEach(fId => allFolderIds.add(fId));
            currentFolderLevel = childIds;
        }

        const folderIdList = Array.from(allFolderIds);

        // 1. Clean up temporary placeholder folder assets
        await prisma.asset.deleteMany({
            where: {
                type: 'folder',
                OR: [
                    { ownerType: 'FOLDER' },
                    { ownerId: { in: folderIdList } },
                    { deletionReason: { contains: id } }
                ]
            }
        }).catch(() => null);

        // 2. Restore actual files and assets to active
        await prisma.asset.updateMany({
            where: {
                type: { not: 'folder' },
                OR: [
                    { ownerId: { in: folderIdList } },
                    { collectionAssets: { some: { collectionId: { in: folderIdList } } } },
                    { sources: { some: { folderId: { in: folderIdList } } } },
                    { deletionReason: { contains: id } }
                ]
            },
            data: {
                status: 'active',
                deletedAt: null,
                deletedByUserId: null,
                deletionReason: null
            }
        });

        return reply.code(200).send({
            success: true,
            message: 'Folder and its items restored successfully.'
        });
    } catch (error) {
        console.error('Error restoring folder:', error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

async function getAllProjectAssetIdsAndObjects(prismaClient, projectId) {
    try {
        const project = await prismaClient.project.findUnique({
            where: { id: projectId },
            include: { sources: true }
        });
        if (!project) return { assetIds: [], assets: [] };

        // 1. Direct assets where ownerType = 'PROJECT' and ownerId = projectId
        const directOwnedAssets = await prismaClient.asset.findMany({
            where: {
                ownerType: 'PROJECT',
                ownerId: projectId,
                globalMedia: false,
                status: { notIn: ['trash', 'deleted'] }
            },
            include: { files: true, metadata: true }
        }).catch(() => []);

        // 2. Direct assets from ProjectSource (sourceableType = 'ASSET')
        const assetSourceIds = (project.sources || [])
            .filter(s => s.sourceableType === 'ASSET' && s.assetId)
            .map(s => s.assetId);

        const sourceAssets = assetSourceIds.length > 0
            ? await prismaClient.asset.findMany({
                where: {
                    id: { in: assetSourceIds },
                    globalMedia: false,
                    status: { notIn: ['trash', 'deleted'] }
                },
                include: { files: true, metadata: true }
            }).catch(() => [])
            : [];

        // 3. Folder IDs linked to this project via ProjectSource
        const folderIdsFromSources = (project.sources || [])
            .filter(s => s.sourceableType === 'FOLDER' && s.folderId)
            .map(s => s.folderId);

        const uniqueFolderIds = Array.from(new Set(folderIdsFromSources.filter(Boolean)));

        // Recursively fetch all assets inside linked folders & subfolders
        let folderAssets = [];
        if (uniqueFolderIds.length > 0) {
            const allFolderIds = new Set(uniqueFolderIds);
            let currentLevel = [...uniqueFolderIds];
            while (currentLevel.length > 0) {
                const childFolders = await prismaClient.folder.findMany({
                    where: { parentId: { in: currentLevel } },
                    select: { id: true }
                }).catch(() => []);
                const childIds = childFolders.map(f => f.id).filter(id => !allFolderIds.has(id));
                if (childIds.length === 0) break;
                childIds.forEach(id => allFolderIds.add(id));
                currentLevel = childIds;
            }

            const folderIdList = Array.from(allFolderIds);
            folderAssets = await prismaClient.asset.findMany({
                where: {
                    ownerType: 'FOLDER',
                    ownerId: { in: folderIdList },
                    globalMedia: false,
                    status: { notIn: ['trash', 'deleted'] }
                },
                include: { files: true, metadata: true }
            }).catch(() => []);
        }

        // Combine and deduplicate all assets by ID
        const assetMap = new Map();
        [...directOwnedAssets, ...sourceAssets, ...folderAssets].forEach(asset => {
            if (asset && asset.id && !assetMap.has(asset.id)) {
                assetMap.set(asset.id, asset);
            }
        });

        const allAssets = Array.from(assetMap.values());
        const allAssetIds = Array.from(assetMap.keys());

        return { assetIds: allAssetIds, assets: allAssets };
    } catch (err) {
        console.error("Error in getAllProjectAssetIdsAndObjects:", err);
        return { assetIds: [], assets: [] };
    }
}

module.exports.getProjectSources = async (request, reply) => {
    try {
        const { projectId } = request.params;
        const { assets } = await getAllProjectAssetIdsAndObjects(prisma, projectId);
        return reply.code(200).send({
            success: true,
            data: {
                media: assets
            }
        });
    } catch (error) {
        console.error("Failed to fetch project sources:", error);
        return reply.code(500).send({ success: false, message: "Internal Server Error" });
    }
};

module.exports.findProjectData = async (request, reply) => {
    try {
        const { projectId } = request.params;
        const userId = request.user?.id;

        if (userId) {
            await verifyProjectAccess(projectId, userId, 'Can view');
        }

        let { assets } = await getAllProjectAssetIdsAndObjects(prisma, projectId);

        const isDeleteFlow = request.query?.isDeleteFlow === 'true' || request.query?.isDeleteFlow === true;
        const projectRecord = await prisma.project.findUnique({
            where: { id: projectId },
            select: { status: true, deletionReason: true }
        }).catch(() => null);

        if (isDeleteFlow && projectRecord && (projectRecord.status === 'pending_super_admin' || projectRecord.status === 'pending_admin_review')) {
            const isSelective = !projectRecord.deletionReason || !projectRecord.deletionReason.toLowerCase().includes('whole');
            if (isSelective) {
                // For selective deletion requests, ONLY include assets specifically marked for deletion FOR THIS PROJECT
                assets = assets.filter(a =>
                    (a.status === 'pending_super_admin' || a.status === 'pending_admin_review') &&
                    a.deletionReason &&
                    a.deletionReason.includes(projectId)
                );
            }
        }

        const projectSources = await prisma.projectSource.findMany({
            where: { projectId },
            include: { folder: true }
        });

        const directFolderIds = projectSources
            .filter(ps => ps.sourceableType === 'FOLDER' && ps.folderId)
            .map(ps => ps.folderId);

        const assetFolderIds = assets
            .map(a => (a.ownerType === 'FOLDER' ? a.ownerId : a.folderId))
            .filter(Boolean);

        const allFolderIds = new Set([...directFolderIds, ...assetFolderIds]);

        // Expand downwards (child subfolders inside project folders)
        let currentDownLevel = Array.from(allFolderIds);
        while (currentDownLevel.length > 0) {
            const children = await prisma.folder.findMany({
                where: { parentId: { in: currentDownLevel } },
                select: { id: true }
            }).catch(() => []);
            const newChildIds = children.map(c => c.id).filter(id => !allFolderIds.has(id));
            if (newChildIds.length === 0) break;
            newChildIds.forEach(id => allFolderIds.add(id));
            currentDownLevel = newChildIds;
        }

        const completeFolders = await prisma.folder.findMany({
            where: { id: { in: Array.from(allFolderIds) } },
            include: { sources: true }
        }).catch(() => []);

        let effectivePermissions = [];
        if (request.user) {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: { workspace: true }
            });
            if (project) {
                effectivePermissions = await resolveUserProjectPermissions(prisma, request.user, project);
            }
        }

        return reply.code(200).send({
            success: true,
            message: 'Project contents fetched successfully.',
            data: {
                media: assets,
                folders: completeFolders,
                effectivePermissions
            }
        });

    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.linkProjectSource = async (request, reply) => {
    try {
        const { projectId } = request.params;
        const { sourceableType, assetId, folderId } = request.body;

        if (!sourceableType || !['ASSET', 'FOLDER'].includes(sourceableType)) {
            return reply.code(400).send({
                success: false,
                message: 'Valid sourceableType (ASSET or FOLDER) is required.'
            });
        }

        if (sourceableType === 'ASSET' && !assetId) {
            return reply.code(400).send({
                success: false,
                message: 'assetId is required when sourceableType is ASSET.'
            });
        }

        if (sourceableType === 'FOLDER' && !folderId) {
            return reply.code(400).send({
                success: false,
                message: 'folderId is required when sourceableType is FOLDER.'
            });
        }

        let oldExpandedTagIdsToRemove = new Set();

        if (sourceableType === 'ASSET' && assetId) {
            const oldSources = await prisma.projectSource.findMany({
                where: {
                    sourceableType: 'ASSET',
                    assetId: assetId
                }
            });
            const oldProjectIds = oldSources.map(s => s.projectId);

            if (oldProjectIds.length > 0) {
                const oldProjectTags = await prisma.projectTag.findMany({
                    where: { projectId: { in: oldProjectIds } },
                    select: { tagId: true }
                });

                for (const pt of oldProjectTags) {
                    oldExpandedTagIdsToRemove.add(pt.tagId);
                    try {
                        const ancestors = await getAncestors(pt.tagId);
                        for (const ancestor of ancestors) {
                            oldExpandedTagIdsToRemove.add(ancestor.id);
                        }
                    } catch (err) {
                        console.warn(`[AssetTag] Failed to fetch ancestors for tag ${pt.tagId}:`, err.message);
                    }
                }
            }

            if (oldExpandedTagIdsToRemove.size > 0) {
                await prisma.assetTag.deleteMany({
                    where: {
                        assetId: assetId,
                        tagId: { in: Array.from(oldExpandedTagIdsToRemove) }
                    }
                });
            }

            await prisma.projectSource.deleteMany({
                where: {
                    sourceableType: 'ASSET',
                    assetId: assetId
                }
            });
        }

        if (sourceableType === 'FOLDER' && folderId) {
            await prisma.projectSource.deleteMany({
                where: {
                    sourceableType: 'FOLDER',
                    folderId: folderId
                }
            });
        }

        const projectSource = await prisma.projectSource.create({
            data: {
                projectId,
                sourceableType,
                assetId: sourceableType === 'ASSET' ? assetId : null,
                folderId: sourceableType === 'FOLDER' ? folderId : null,
            }
        });

        // Apply project default tags automatically to the newly linked asset
        if (sourceableType === 'ASSET' && assetId) {
            try {
                // Fetch project default tags
                const projectTags = await prisma.projectTag.findMany({
                    where: { projectId },
                    select: { tagId: true }
                });

                if (projectTags.length > 0) {
                    const expandedTagIds = new Set();

                    for (const pt of projectTags) {
                        expandedTagIds.add(pt.tagId);
                        try {
                            const ancestors = await getAncestors(pt.tagId);
                            for (const ancestor of ancestors) {
                                expandedTagIds.add(ancestor.id);
                            }
                        } catch (err) {
                            console.warn(`[AssetTag] Failed to fetch ancestors for tag ${pt.tagId}:`, err.message);
                        }
                    }

                    for (const targetTagId of expandedTagIds) {
                        await prisma.assetTag.upsert({
                            where: {
                                assetId_tagId: {
                                    assetId,
                                    tagId: targetTagId
                                }
                            },
                            update: {},
                            create: {
                                assetId,
                                tagId: targetTagId,
                                addedById: request.user.id
                            }
                        });
                    }
                }
            } catch (tagErr) {
                console.warn(`[AssetTag] Could not assign default tags when linking asset ${assetId} to project ${projectId}:`, tagErr.message);
            }
        }

        const typeStr = sourceableType === 'ASSET' ? 'asset' : 'folder';
        const sourceId = sourceableType === 'ASSET' ? assetId : folderId;
        const itemPath = await buildItemPath(prisma, typeStr, sourceId);
        const projectPath = await buildItemPath(prisma, 'project', projectId);
        logSuccess(ACTIVITY_NAME.PROJECT_LINKED, `Linked ${typeStr} "${itemPath}" to project "${projectPath}".`, request);

        return reply.code(201).send({
            success: true,
            message: 'Source linked to project successfully.',
            data: projectSource
        });

    } catch (error) {
        console.error(error);

        // Handle unique constraint violation (P2002) for duplicate links
        if (error.code === 'P2002') {
            return reply.code(409).send({
                success: false,
                message: 'This source is already linked to the project.'
            });
        }

        logError(ACTIVITY_NAME.PROJECT_LINKED, "Failed to link source to project", error, request);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.updateFolder = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name, color } = request.body;

        if (!name && color === undefined) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name or color is required.'
            });
        }

        if (name && name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name cannot exceed 100 characters.'
            });
        }

        const folderToUpdate = await prisma.folder.findUnique({
            where: { id },
            select: { workspaceId: true, name: true }
        });
        if (!folderToUpdate) {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }

        if (folderToUpdate.name && folderToUpdate.name.trim().toLowerCase() === 'restore') {
            return reply.code(400).send({
                success: false,
                message: 'The Restore folder is a protected system folder and cannot be renamed.'
            });
        }

        if (name !== undefined) {
            const duplicateFolder = await prisma.folder.findFirst({
                where: {
                    workspaceId: folderToUpdate.workspaceId,
                    name: name.trim(),
                    id: { not: id }
                }
            });
            if (duplicateFolder) {
                return reply.code(400).send({
                    success: false,
                    message: 'A folder with this name already exists in this workspace.'
                });
            }
        }

        const dataToUpdate = {};
        if (name) dataToUpdate.name = name;
        if (color !== undefined) dataToUpdate.color = color;

        const folder = await prisma.folder.update({
            where: { id },
            data: dataToUpdate
        });
        const itemPath = await buildItemPath(prisma, 'folder', id);
        logSuccess(ACTIVITY_NAME.FOLDER_UPDATED, `Folder "${itemPath}" updated successfully.`, request);
        return reply.send({
            success: true,
            message: 'Folder updated successfully.',
            data: folder
        });
    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME.FOLDER_UPDATED, `Failed to update folder`, request, error);
        if (error.code === 'P2025') {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.moveFolder = async (request, reply) => {
    try {
        const { id } = request.params;
        const { targetFolderId, targetWorkspaceId } = request.body;

        if (!targetFolderId && !targetWorkspaceId) {
            return reply.code(400).send({
                success: false,
                message: 'Either targetFolderId or targetWorkspaceId must be provided.'
            });
        }

        const folder = await prisma.folder.findFirst({
            where: { id }
        });

        if (!folder) {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }

        if (folder.name && folder.name.trim().toLowerCase() === 'restore') {
            return reply.code(400).send({
                success: false,
                message: 'The Restore folder is a protected system folder and cannot be moved.'
            });
        }

        let newWorkspaceId = targetWorkspaceId || folder.workspaceId;
        let newParentId = targetFolderId || null;

        if (targetFolderId) {
            const targetFolder = await prisma.folder.findFirst({
                where: { id: targetFolderId }
            });
            if (!targetFolder) {
                return reply.code(404).send({ success: false, message: 'Target folder not found.' });
            }
            newWorkspaceId = targetFolder.workspaceId;
        } else if (targetWorkspaceId) {
            const workspace = await prisma.workspace.findFirst({
                where: { id: targetWorkspaceId }
            });
            if (!workspace) {
                return reply.code(404).send({ success: false, message: 'Target workspace not found.' });
            }
        }

        // Prevent moving folder into itself
        if (id === targetFolderId) {
            return reply.code(400).send({ success: false, message: 'Cannot move folder into itself.' });
        }

        const updatedFolder = await prisma.folder.update({
            where: { id },
            data: {
                parentId: newParentId,
                workspaceId: newWorkspaceId
            }
        });

        // Recursively update workspaceId for all descendant folders if the workspace changed
        if (folder.workspaceId !== newWorkspaceId) {
            // 1. Gather all folder IDs involved in the move
            const movingFolderIds = [id];
            const getDescendantIds = async (parentId) => {
                const children = await prisma.folder.findMany({ where: { parentId }, select: { id: true } });
                for (const child of children) {
                    movingFolderIds.push(child.id);
                    await getDescendantIds(child.id);
                }
            };
            await getDescendantIds(id);

            // 2. Identify all projects inside the moving folders
            const movingProjects = await prisma.project.findMany({
                where: { folderId: { in: movingFolderIds } },
                select: { id: true }
            });
            const movingProjectIds = movingProjects.map(p => p.id);

            // 3. Find all assets inside these moving folders
            const movingAssets = await prisma.asset.findMany({
                where: { ownerType: 'FOLDER', ownerId: { in: movingFolderIds } },
                select: { id: true }
            });
            const movingAssetIds = movingAssets.map(a => a.id);

            // 4. Update folders, projects, and assets to the new workspaceId
            await prisma.folder.updateMany({
                where: { id: { in: movingFolderIds } },
                data: { workspaceId: newWorkspaceId }
            });

            if (movingProjectIds.length > 0) {
                await prisma.project.updateMany({
                    where: { id: { in: movingProjectIds } },
                    data: { workspaceId: newWorkspaceId }
                });
            }

            // Update workspaceId on all assets physically inside the moving folders
            if (movingAssetIds.length > 0) {
                await prisma.asset.updateMany({
                    where: { id: { in: movingAssetIds } },
                    data: { workspaceId: newWorkspaceId }
                });
            }

            // 5. Unlink moving folders from any outside projects
            await prisma.projectSource.deleteMany({
                where: {
                    sourceableType: 'FOLDER',
                    folderId: { in: movingFolderIds },
                    projectId: { notIn: movingProjectIds } // keep links for projects inside the moving folder
                }
            });

            // 6. Unlink moving assets from any outside projects
            if (movingAssetIds.length > 0) {
                await prisma.projectSource.deleteMany({
                    where: {
                        sourceableType: 'ASSET',
                        assetId: { in: movingAssetIds },
                        projectId: { notIn: movingProjectIds } // keep links for projects inside the moving folder
                    }
                });

                // 7. Remove project-scoped tags from moving assets (since they changed workspace)
                const projectTagsToWipe = await prisma.tag.findMany({
                    where: { scope: 'project' },
                    select: { id: true }
                });
                const projectTagIds = projectTagsToWipe.map(t => t.id);

                if (projectTagIds.length > 0) {
                    await prisma.assetTag.deleteMany({
                        where: {
                            assetId: { in: movingAssetIds },
                            tagId: { in: projectTagIds }
                        }
                    });
                }
            }

            // 8. Handle moving projects: unlink outside assets/folders and clear inherited tags
            if (movingProjectIds.length > 0) {
                // a. Find all default tags of these moving projects
                const projectTags = await prisma.projectTag.findMany({
                    where: { projectId: { in: movingProjectIds } },
                    select: { tagId: true }
                });

                // b. Expand to include ancestors
                let expandedTagIdsToRemove = new Set();
                for (const pt of projectTags) {
                    expandedTagIdsToRemove.add(pt.tagId);
                    try {
                        const ancestors = await getAncestors(pt.tagId);
                        for (const ancestor of ancestors) {
                            expandedTagIdsToRemove.add(ancestor.id);
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch ancestors for tag ${pt.tagId}:`, err.message);
                    }
                }

                const tagsToRemoveArray = Array.from(expandedTagIdsToRemove);

                // Filter to ONLY project-scoped tags (preserve company/personal tags)
                const projectTagsToWipe = await prisma.tag.findMany({
                    where: {
                        id: { in: tagsToRemoveArray },
                        scope: 'project'
                    },
                    select: { id: true }
                });
                const projectTagsToWipeIds = projectTagsToWipe.map(t => t.id);

                // c. Find the outside assets linked to moving projects
                const outsideProjectSources = await prisma.projectSource.findMany({
                    where: {
                        projectId: { in: movingProjectIds },
                        sourceableType: 'ASSET',
                        assetId: { notIn: movingAssetIds }
                    },
                    select: { assetId: true }
                });
                const outsideAssetIds = outsideProjectSources.map(s => s.assetId).filter(Boolean);

                // d. Remove ONLY project-scoped inherited tags from the outside assets
                if (outsideAssetIds.length > 0 && projectTagsToWipeIds.length > 0) {
                    await prisma.assetTag.deleteMany({
                        where: {
                            assetId: { in: outsideAssetIds },
                            tagId: { in: projectTagsToWipeIds }
                        }
                    });
                }

                // e. Unlink outside assets from the moving projects
                await prisma.projectSource.deleteMany({
                    where: {
                        projectId: { in: movingProjectIds },
                        sourceableType: 'ASSET',
                        assetId: { notIn: movingAssetIds }
                    }
                });

                // f. Unlink outside folders from the moving projects
                await prisma.projectSource.deleteMany({
                    where: {
                        projectId: { in: movingProjectIds },
                        sourceableType: 'FOLDER',
                        folderId: { notIn: movingFolderIds }
                    }
                });

                // g. Wipe default tags from the moving projects themselves
                // Since they are moving to a new workspace, their old workspace tags are invalid
                await prisma.projectTag.deleteMany({
                    where: {
                        projectId: { in: movingProjectIds }
                    }
                });
            }
        }
        const itemPath = await buildItemPath(prisma, 'folder', id);
        logSuccess(ACTIVITY_NAME.FOLDER_MOVED, `Folder "${itemPath}" moved successfully.`, request);
        return reply.code(200).send({
            success: true,
            message: 'Folder moved successfully.',
            data: updatedFolder
        });
    } catch (error) {
        console.error('Failed to move folder:', error);
        logError(ACTIVITY_NAME.FOLDER_MOVED, `Failed to move folder`, request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.updateProject = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name, workspaceId, visibility, status, color } = request.body;

        const requiresFullAccess = (workspaceId !== undefined || visibility !== undefined || status !== undefined);
        const requiredAccessLevel = requiresFullAccess ? 'Full Access' : 'Can edit';
        await verifyProjectAccess(id, request.user.id, requiredAccessLevel);

        if (name === undefined && workspaceId === undefined && visibility === undefined && status === undefined && color === undefined) {
            return reply.code(400).send({
                success: false,
                message: 'No update fields provided.'
            });
        }

        if (name !== undefined) {
            if (!name || !name.trim()) {
                return reply.code(400).send({
                    success: false,
                    message: 'Project name is required.'
                });
            }

            if (name.length > 100) {
                return reply.code(400).send({
                    success: false,
                    message: 'Project name cannot exceed 100 characters.'
                });
            }
        }

        const projectToUpdate = await prisma.project.findUnique({
            where: { id },
            select: { workspaceId: true }
        });
        if (!projectToUpdate) {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }

        const activeWorkspaceId = workspaceId || projectToUpdate.workspaceId;

        if (name !== undefined) {
            const existingProject = await prisma.project.findFirst({
                where: {
                    workspaceId: activeWorkspaceId,
                    name: name.trim(),
                    id: { not: id },
                    status: { notIn: ['deleted', 'trash'] }
                }
            });
            if (existingProject) {
                return reply.code(400).send({
                    success: false,
                    message: 'A project with this name already exists in this workspace.'
                });
            }
        }

        const dataToUpdate = {};
        if (name !== undefined) dataToUpdate.name = name;
        if (workspaceId !== undefined && workspaceId) {
            dataToUpdate.workspaceId = workspaceId;
            dataToUpdate.ownerType = 'WORKSPACE';
        }
        if (visibility !== undefined) dataToUpdate.visibility = visibility;
        if (status !== undefined) dataToUpdate.status = status.toLowerCase();
        if (color !== undefined) dataToUpdate.color = color;

        const project = await prisma.project.update({
            where: { id },
            data: dataToUpdate
        });
        const itemPath = await buildItemPath(prisma, 'project', id);
        logSuccess(ACTIVITY_NAME.PROJECT_UPDATED, `Project "${itemPath}" updated successfully.`, request);
        return reply.send({
            success: true,
            message: 'Project updated successfully.',
            data: project
        });
    } catch (error) {
        console.error("Error in updateProject:", error);
        logError(ACTIVITY_NAME.PROJECT_UPDATED, `Failed to update project`, request, error);
        if (error.statusCode) {
            return reply.code(error.statusCode).send({ success: false, message: error.message });
        }
        if (error.code === 'P2025') {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }
        return reply.code(500).send({ success: false, message: error.message || 'Internal Server Error' });
    }
};

module.exports.findTimezone = async (request, reply) => {
    try {
        const tzSetting = await request.server.prisma.systemTimezone.findFirst({
            where: { type: 'workspace', enabled: true }
        });
        const timeZone = tzSetting ? tzSetting.timezone : 'Europe/London';

        return reply.code(200).send({
            success: true,
            timezone: timeZone
        });
    } catch (error) {
        request.server.log.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to fetch timezone',
            timezone: 'Europe/London'
        });
    }
};

module.exports.deleteProject = async (request, reply) => {
    try {
        const { id } = request.params;
        const { isWholeProject = false, deleteFileIds = [], deleteFolderIds = [], deletionReason } = request.body || {};

        await verifyProjectAccess(id, request.user.id, 'Full Access');

        const liveUser = await prisma.user.findUnique({
            where: { id: request.user.id },
            include: { roleRelation: true }
        });
        const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
        const userRole = rawRoleName.trim().toLowerCase();
        const isSuperAdmin = userRole === 'super admin' || userRole === 'superadmin';

        // Fetch project details for notification
        const targetProject = await prisma.project.findUnique({
            where: { id },
            include: { workspace: true }
        });
        if (!targetProject) {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }

        const projectName = targetProject?.name || 'Project';
        const itemPath = await buildItemPath(prisma, 'project', id);
        const orgId = liveUser?.orgId || targetProject?.workspace?.orgId || request.user?.orgId;
        const userName = liveUser?.name || liveUser?.email || 'User';

        // Fetch all linked asset IDs for this project
        const { assetIds: allLinkedAssetIds } = await getAllProjectAssetIdsAndObjects(prisma, id);

        if (isSuperAdmin) {
            // Super Admin executing permanent deletion from Database and Backblaze B2
            if (isWholeProject) {
                const { assets: allLinkedAssets, assetIds: allLinkedAssetIds } = await getAllProjectAssetIdsAndObjects(prisma, id);

                const reasonAssets = await prisma.asset.findMany({
                    where: {
                        deletionReason: { contains: id },
                        status: { in: ['pending_super_admin', 'pending_admin_review', 'trash', 'deleted'] }
                    },
                    include: { files: true }
                }).catch(() => []);

                const assetMap = new Map();
                [...allLinkedAssets, ...reasonAssets].forEach(a => {
                    if (a && a.id) assetMap.set(a.id, a);
                });
                const totalAssetsToDelete = Array.from(assetMap.values());
                const totalAssetIds = Array.from(assetMap.keys());

                // Find all project folders directly linked or owned
                const projectFolderSources = await prisma.projectSource.findMany({
                    where: { projectId: id, sourceableType: 'FOLDER' },
                    select: { folderId: true }
                }).catch(() => []);

                const initialFolderIds = new Set(
                    projectFolderSources.map(s => s.folderId).filter(Boolean)
                );

                const allFolderIds = new Set(initialFolderIds);
                let currentFolderLevel = Array.from(initialFolderIds);
                while (currentFolderLevel.length > 0) {
                    const childFolders = await prisma.folder.findMany({
                        where: { parentId: { in: currentFolderLevel } },
                        select: { id: true }
                    }).catch(() => []);
                    const childIds = childFolders.map(f => f.id).filter(fId => !allFolderIds.has(fId));
                    if (childIds.length === 0) break;
                    childIds.forEach(fId => allFolderIds.add(fId));
                    currentFolderLevel = childIds;
                }

                // Delete file objects from Backblaze B2 Cloud & update org storage usage
                for (const asset of totalAssetsToDelete) {
                    let assetSizeBytes = 0;
                    if (asset.files && asset.files.length > 0) {
                        for (const f of asset.files) {
                            assetSizeBytes += Number(f.sizeBytes || 0);
                            if (f.filePath && (await b2()).isEnabled()) {
                                try {
                                    await (await b2()).deleteFile(f.filePath);
                                    await (await b2()).permanentlyDeleteFile(f.filePath);
                                } catch (b2Err) {
                                    console.warn(`[Permanent Delete] Could not delete B2 key ${f.filePath}:`, b2Err.message);
                                }
                            }
                        }
                    }

                    if (assetSizeBytes > 0 && (asset.orgId || orgId)) {
                        try {
                            await recordStorageDelta(prisma, {
                                orgId: asset.orgId || orgId,
                                deltaBytes: -assetSizeBytes,
                                assetId: asset.id,
                                reason: 'permanent_delete',
                            });
                        } catch (dErr) {
                            console.warn('Failed to record storage delta for permanent delete:', dErr.message);
                        }
                    }
                }

                // Purge asset records from Database
                if (totalAssetIds.length > 0) {
                    await prisma.assetFile.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.assetMetadata.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.assetTag.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.assetUser.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.assetGroup.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.collectionAsset.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.annotation.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.projectSource.deleteMany({ where: { assetId: { in: totalAssetIds } } }).catch(() => null);
                    await prisma.asset.deleteMany({ where: { id: { in: totalAssetIds } } }).catch(() => null);
                }

                // Purge folder records from Database
                if (allFolderIds.size > 0) {
                    const folderIdList = Array.from(allFolderIds);
                    await prisma.projectSource.deleteMany({ where: { folderId: { in: folderIdList } } }).catch(() => null);
                    await prisma.folderUser.deleteMany({ where: { folderId: { in: folderIdList } } }).catch(() => null);
                    await prisma.favorite.deleteMany({ where: { folderId: { in: folderIdList } } }).catch(() => null);
                    await prisma.folder.deleteMany({ where: { id: { in: folderIdList } } }).catch(() => null);
                }

                await prisma.projectSource.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.projectUser.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.projectGroup.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.projectTag.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.favorite.deleteMany({ where: { projectId: id } }).catch(() => null);

                await prisma.project.delete({ where: { id } }).catch(() => null);

                await notifyRole(request.server, orgId, 'Admin', 'deletion_alert', 'Project Permanently Deleted', `${userName} (Super Admin) permanently deleted project '${projectName}'.`, id);
                logSuccess(ACTIVITY_NAME.PROJECT_DELETED, `Project "${itemPath}" and all files permanently deleted from database and Backblaze B2.`, request);
                return reply.code(200).send({
                    success: true,
                    message: 'Project, folders, and all files permanently deleted from database and Backblaze B2.'
                });
            } else {
                let targetAssetIds = Array.from(
                    new Set([...(Array.isArray(deleteFileIds) ? deleteFileIds : [])])
                );

                const selectedFolderSet = new Set(Array.isArray(deleteFolderIds) ? deleteFolderIds : []);
                let currentFolderLevel = Array.from(selectedFolderSet);
                while (currentFolderLevel.length > 0) {
                    const childFolders = await prisma.folder.findMany({
                        where: { parentId: { in: currentFolderLevel } },
                        select: { id: true }
                    }).catch(() => []);
                    const childIds = childFolders.map(f => f.id).filter(fId => !selectedFolderSet.has(fId));
                    if (childIds.length === 0) break;
                    childIds.forEach(fId => selectedFolderSet.add(fId));
                    currentFolderLevel = childIds;
                }
                const targetFolderIds = Array.from(selectedFolderSet);
                const workspaceId = targetProject?.workspaceId || liveUser?.workspaceId;

                const { assets: allProjectAssets } = await getAllProjectAssetIdsAndObjects(prisma, id);
                const projectFolderSources = await prisma.projectSource.findMany({
                    where: { projectId: id, sourceableType: 'FOLDER' },
                    select: { folderId: true }
                }).catch(() => []);
                const initialFolderIds = new Set(projectFolderSources.map(s => s.folderId).filter(Boolean));
                const allProjectFolderIds = new Set(initialFolderIds);
                let currentProjFolderLevel = Array.from(initialFolderIds);
                while (currentProjFolderLevel.length > 0) {
                    const childFolders = await prisma.folder.findMany({
                        where: { parentId: { in: currentProjFolderLevel } },
                        select: { id: true }
                    }).catch(() => []);
                    const childIds = childFolders.map(f => f.id).filter(fId => !allProjectFolderIds.has(fId));
                    if (childIds.length === 0) break;
                    childIds.forEach(fId => allProjectFolderIds.add(fId));
                    currentProjFolderLevel = childIds;
                }

                await handleUnselectedItemsPreservation(prisma, {
                    workspaceId,
                    targetFolderIds,
                    finalAssetIdsToDelete: targetAssetIds,
                    allFolderIds: Array.from(allProjectFolderIds),
                    allFolderAssets: allProjectAssets
                });

                if (targetAssetIds.length === 0 && targetFolderIds.length === 0) {
                    const pendingAssets = await prisma.asset.findMany({
                        where: {
                            deletionReason: { contains: id },
                            status: { in: ['pending_super_admin', 'pending_admin_review'] }
                        },
                        select: { id: true }
                    }).catch(() => []);
                    targetAssetIds = pendingAssets.map(a => a.id);
                }

                if (targetAssetIds.length > 0) {
                    const assetsToDelete = await prisma.asset.findMany({
                        where: { id: { in: targetAssetIds } },
                        include: { files: true }
                    }).catch(() => []);

                    for (const asset of assetsToDelete) {
                        let assetSizeBytes = 0;
                        if (asset.files && asset.files.length > 0) {
                            for (const f of asset.files) {
                                assetSizeBytes += Number(f.sizeBytes || 0);
                                if (f.filePath && (await b2()).isEnabled()) {
                                    try {
                                        await (await b2()).deleteFile(f.filePath);
                                        await (await b2()).permanentlyDeleteFile(f.filePath);
                                    } catch (b2Err) {
                                        console.warn(`[Permanent Delete] Could not delete B2 key ${f.filePath}:`, b2Err.message);
                                    }
                                }
                            }
                        }

                        if (assetSizeBytes > 0 && (asset.orgId || orgId)) {
                            try {
                                await recordStorageDelta(prisma, {
                                    orgId: asset.orgId || orgId,
                                    deltaBytes: -assetSizeBytes,
                                    assetId: asset.id,
                                    reason: 'permanent_delete',
                                });
                            } catch (dErr) {
                                console.warn('Failed to record storage delta:', dErr.message);
                            }
                        }
                    }

                    await prisma.assetFile.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.assetMetadata.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.assetTag.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.assetUser.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.assetGroup.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.collectionAsset.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.annotation.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.projectSource.deleteMany({ where: { assetId: { in: targetAssetIds } } }).catch(() => null);
                    await prisma.asset.deleteMany({ where: { id: { in: targetAssetIds } } }).catch(() => null);
                }

                if (targetFolderIds.length > 0) {
                    await prisma.projectSource.deleteMany({ where: { folderId: { in: targetFolderIds } } }).catch(() => null);
                    await prisma.folderUser.deleteMany({ where: { folderId: { in: targetFolderIds } } }).catch(() => null);
                    await prisma.favorite.deleteMany({ where: { folderId: { in: targetFolderIds } } }).catch(() => null);
                    await prisma.folder.deleteMany({ where: { id: { in: targetFolderIds } } }).catch(() => null);
                }

                // Restore any pending assets associated with this project that were UNCHECKED by Super Admin back to active status
                const uncheckedAssets = await prisma.asset.findMany({
                    where: {
                        deletionReason: { contains: id },
                        id: { notIn: targetAssetIds }
                    },
                    select: { id: true }
                }).catch(() => []);

                const uncheckedAssetIds = uncheckedAssets.map(a => a.id);

                if (uncheckedAssetIds.length > 0) {
                    // 1. Remove project source links (project tags/associations)
                    await prisma.projectSource.deleteMany({
                        where: { assetId: { in: uncheckedAssetIds } }
                    }).catch(() => null);

                    // 2. Restore asset status to active
                    await prisma.asset.updateMany({
                        where: { id: { in: uncheckedAssetIds } },
                        data: {
                            status: 'active',
                            deletedAt: null,
                            deletedByUserId: null,
                            deletionReason: null
                        }
                    }).catch(() => null);

                    // 3. Reset ownerType from PROJECT to WORKSPACE so project tags are stripped
                    if (targetProject?.workspaceId) {
                        await prisma.asset.updateMany({
                            where: {
                                id: { in: uncheckedAssetIds },
                                ownerType: 'PROJECT',
                                ownerId: id
                            },
                            data: {
                                ownerType: 'WORKSPACE',
                                ownerId: targetProject.workspaceId
                            }
                        }).catch(() => null);
                    }
                }

                // Purge project record from Database
                await prisma.projectSource.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.projectUser.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.projectGroup.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.projectTag.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.favorite.deleteMany({ where: { projectId: id } }).catch(() => null);
                await prisma.project.delete({ where: { id } }).catch(() => null);

                await notifyRole(request.server, orgId, 'Admin', 'deletion_alert', 'Project Files Permanently Deleted', `${userName} (Super Admin) permanently deleted ${targetAssetIds.length} file(s) and ${targetFolderIds.length} folder(s) from project '${projectName}'.`, id);

                logSuccess(ACTIVITY_NAME.PROJECT_DELETED, `Super Admin permanently deleted ${targetAssetIds.length} file(s) and ${targetFolderIds.length} folder(s) from project "${projectName}".`, request);

                return reply.code(200).send({
                    success: true,
                    message: `${targetAssetIds.length} file(s) and ${targetFolderIds.length} folder(s) permanently deleted from database and Backblaze B2.`
                });
            }
        } else {
            // Always set project status to pending_super_admin so project is marked for deletion and removed from Admin Projects list and All media
            await prisma.project.update({
                where: { id },
                data: {
                    status: 'pending_super_admin',
                    deletedAt: new Date(),
                    deletedByUserId: request.user.id,
                    deletionReason: deletionReason || (isWholeProject ? 'Whole Project deletion requested' : 'Project deletion with selected items requested')
                }
            });

            if (isWholeProject) {
                if (allLinkedAssetIds.length > 0) {
                    await prisma.asset.updateMany({
                        where: { id: { in: allLinkedAssetIds } },
                        data: {
                            status: 'pending_super_admin',
                            deletedAt: new Date(),
                            deletedByUserId: request.user.id,
                            deletionReason: deletionReason || `Deleted with project: [${id}] ${projectName}`
                        }
                    });
                }

                await notifyRole(request.server, orgId, 'Super Admin', 'approval_request', 'Project Deletion Request', `${userName} (${rawRoleName}) requested whole project deletion for '${projectName}'.`, id);

                logSuccess(ACTIVITY_NAME.PROJECT_DELETED, `Admin requested whole project deletion for "${itemPath}". Submitted for Super Admin review.`, request);

                return reply.code(200).send({
                    success: true,
                    message: 'Project deletion request submitted for Super Admin review.'
                });
            } else {
                const allProjectFolderSources = await prisma.projectSource.findMany({
                    where: { projectId: id, sourceableType: 'FOLDER' },
                    select: { folderId: true }
                }).catch(() => []);
                const allProjectFolderIds = allProjectFolderSources.map(s => s.folderId).filter(Boolean);

                const explicitlySelectedFolders = Array.isArray(deleteFolderIds) ? deleteFolderIds : [];
                const selectedFolderSet = new Set(explicitlySelectedFolders);

                // Unlink UNCHECKED folders from project so they stay safe in workspace
                const uncheckedFolderIds = allProjectFolderIds.filter(fId => !selectedFolderSet.has(fId));
                if (uncheckedFolderIds.length > 0) {
                    await prisma.projectSource.deleteMany({
                        where: {
                            projectId: id,
                            folderId: { in: uncheckedFolderIds }
                        }
                    }).catch(() => null);
                }

                let folderAssetIds = [];
                const folderIdMap = new Map();

                if (explicitlySelectedFolders.length > 0) {
                    const allFolderIds = new Set(explicitlySelectedFolders);
                    let currentLevel = [...explicitlySelectedFolders];
                    while (currentLevel.length > 0) {
                        const childFolders = await prisma.folder.findMany({
                            where: { parentId: { in: currentLevel } },
                            select: { id: true }
                        }).catch(() => []);
                        const childIds = childFolders.map(f => f.id).filter(fId => !allFolderIds.has(fId));
                        if (childIds.length === 0) break;
                        childIds.forEach(fId => allFolderIds.add(fId));
                        currentLevel = childIds;
                    }

                    const explicitFileIdsSet = new Set(Array.isArray(deleteFileIds) ? deleteFileIds : []);
                    const hasExplicitFileSelections = Array.isArray(deleteFileIds);

                    const folderAssets = await prisma.asset.findMany({
                        where: {
                            ownerType: 'FOLDER',
                            ownerId: { in: Array.from(allFolderIds) },
                            status: { notIn: ['trash', 'deleted'] }
                        },
                        select: { id: true, ownerId: true }
                    }).catch(() => []);

                    const foldersWithAssets = new Set();
                    folderAssets.forEach(a => {
                        // Respect Admin's explicit unchecking of files inside selected folders
                        const isExplicitlyUnchecked = hasExplicitFileSelections && !explicitFileIdsSet.has(a.id);
                        if (!isExplicitlyUnchecked) {
                            folderAssetIds.push(a.id);
                            folderIdMap.set(a.id, a.ownerId);
                            foldersWithAssets.add(a.ownerId);
                        }
                    });

                    // For explicitly selected folders with 0 active assets inside, create a tracking asset so Super Admin panel tracks the folder
                    for (const fId of explicitlySelectedFolders) {
                        if (!foldersWithAssets.has(fId)) {
                            const fRecord = await prisma.folder.findUnique({
                                where: { id: fId },
                                select: { name: true }
                            }).catch(() => null);

                            const fName = fRecord?.name || 'Folder';
                            await prisma.asset.create({
                                data: {
                                    orgId: orgId,
                                    title: fName,
                                    type: 'folder',
                                    ownerType: 'FOLDER',
                                    ownerId: fId,
                                    status: 'pending_super_admin',
                                    deletedAt: new Date(),
                                    deletedByUserId: request.user.id,
                                    deletionReason: `Selected deletion from project: [${id}] folder:[${fId}] ${projectName}`
                                }
                            }).catch(() => null);
                        }
                    }
                }

                const fileAssetIds = (Array.isArray(deleteFileIds) ? deleteFileIds : []).filter(aId => allLinkedAssetIds.includes(aId));

                // Unlink UNCHECKED files from project so they stay safe in workspace
                const selectedFileSet = new Set(fileAssetIds);
                const uncheckedAssetIds = allLinkedAssetIds.filter(aId => !selectedFileSet.has(aId) && !folderAssetIds.includes(aId));
                if (uncheckedAssetIds.length > 0) {
                    await prisma.projectSource.deleteMany({
                        where: {
                            projectId: id,
                            assetId: { in: uncheckedAssetIds }
                        }
                    }).catch(() => null);

                    await prisma.asset.updateMany({
                        where: { id: { in: uncheckedAssetIds } },
                        data: {
                            status: 'active',
                            deletionReason: null,
                            ownerType: 'WORKSPACE',
                            ownerId: targetProject.workspaceId
                        }
                    }).catch(() => null);
                }

                const targetAssetIds = Array.from(
                    new Set([...fileAssetIds, ...folderAssetIds])
                ).filter(aId => allLinkedAssetIds.includes(aId));

                for (const aId of targetAssetIds) {
                    const fId = folderIdMap.get(aId);
                    const folderTag = fId ? ` folder:[${fId}]` : '';
                    await prisma.asset.update({
                        where: { id: aId },
                        data: {
                            status: 'pending_super_admin',
                            deletedAt: new Date(),
                            deletedByUserId: request.user.id,
                            deletionReason: deletionReason || `Selected deletion from project: [${id}]${folderTag} ${projectName}`
                        }
                    }).catch(() => null);
                }

                await notifyRole(request.server, orgId, 'Super Admin', 'approval_request', 'Project Deletion Request', `${userName} (${rawRoleName}) requested deletion of project '${projectName}' with selected files/folders.`, id);

                logSuccess(ACTIVITY_NAME.PROJECT_DELETED, `Admin requested deletion of project "${itemPath}" with selected files/folders. Submitted for Super Admin review.`, request);

                return reply.code(200).send({
                    success: true,
                    message: `Project deletion request for '${projectName}' submitted for Super Admin review.`
                });
            }
        }
    } catch (error) {
        console.error('Failed to delete project / selected files:', error);
        logError(ACTIVITY_NAME.PROJECT_DELETED, `Failed to delete project`, request, error);
        if (error.code === 'P2025' || error.statusCode === 404) {
            return reply.code(404).send({ success: false, message: error.message || 'Project not found.' });
        }
        if (error.statusCode) {
            return reply.code(error.statusCode).send({ success: false, message: error.message || 'Access denied.' });
        }
        return reply.code(500).send({ success: false, message: error.message || 'Internal Server Error' });
    }
};

module.exports.restoreProject = async (request, reply) => {
    try {
        const { id } = request.params;
        await verifyProjectAccess(id, request.user.id, 'Full Access');

        const targetProject = await prisma.project.findUnique({
            where: { id },
            select: { name: true, deletedByUserId: true, workspaceId: true }
        }).catch(() => null);

        const projectName = targetProject?.name || 'Project';

        const { assetIds: allLinkedAssetIds } = await getAllProjectAssetIdsAndObjects(prisma, id);

        await prisma.project.update({
            where: { id },
            data: {
                status: 'active',
                deletedAt: null,
                deletedByUserId: null,
                deletionReason: null
            }
        });

        // Delete tracking assets created for empty folders
        await prisma.asset.deleteMany({
            where: {
                type: 'folder',
                deletionReason: { contains: id },
                status: { in: ['pending_super_admin', 'pending_admin_review'] }
            }
        }).catch(() => null);

        // Restore real pending assets associated with this project back to active
        await prisma.asset.updateMany({
            where: {
                OR: [
                    { id: { in: allLinkedAssetIds } },
                    { deletionReason: { contains: id } }
                ],
                status: { in: ['pending_super_admin', 'pending_admin_review'] }
            },
            data: {
                status: 'active',
                deletedAt: null,
                deletedByUserId: null,
                deletionReason: null
            }
        }).catch(() => null);

        if (targetProject?.deletedByUserId) {
            const userName = request.user?.name || 'Super Admin';
            await createNotification(
                request.server,
                targetProject.deletedByUserId,
                null,
                'deletion_rejected',
                'Project Deletion Rejected',
                `${userName} rejected the deletion request for project '${projectName}'. The project and its files have been restored to Active status.`,
                id
            ).catch(() => null);
        }

        const itemPath = await buildItemPath(prisma, 'project', id);
        logSuccess(ACTIVITY_NAME.PROJECT_UPDATED, `Project "${itemPath}" restored from deletion queue.`, request);

        return reply.code(200).send({
            success: true,
            message: `Project '${projectName}' and all its associated files/folders restored to Active successfully.`
        });
    } catch (error) {
        console.error('Failed to restore project:', error);
        logError(ACTIVITY_NAME.PROJECT_UPDATED, `Failed to restore project`, request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.searchGuestUsers = async (request, reply) => {
    try {
        const { q = '' } = request.query;
        const { orgId } = request.user;

        if (!q || q.trim().length < 2) {
            return reply.code(200).send({ success: true, data: [] });
        }

        const normalized = q.trim().toLowerCase();

        // Search users from OTHER organizations (not the current user's org)
        const users = await prisma.user.findMany({
            where: {
                orgId: { not: orgId },
                status: 'active',
                OR: [
                    { email: { contains: normalized, mode: 'insensitive' } },
                    { name: { contains: normalized, mode: 'insensitive' } },
                ]
            },
            select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                organization: { select: { name: true } }
            },
            take: 10,
        });

        return reply.code(200).send({
            success: true,
            data: users.map(u => ({
                id: u.id,
                name: u.name || u.email.split('@')[0],
                email: u.email,
                avatarUrl: u.avatarUrl || null,
                orgName: u.organization?.name || null,
            }))
        });

    } catch (error) {
        console.error('Error searching guest users:', error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.findAccessLevels = async (request, reply) => {
    try {
        const accessLevels = await prisma.accessLevel.findMany({
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, title: true, description: true }
        });

        return reply.code(200).send({
            success: true,
            data: accessLevels
        });
    } catch (error) {
        console.error('Error fetching access levels:', error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.deleteWorkspace = async (request, reply) => {
    try {
        const { id } = request.params;
        const { orgId, role, roleId } = request.user || {};

        const userRoleName = typeof role === 'string' ? role : '';
        const isSuperAdmin = userRoleName === 'Super Admin' || roleId === '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15' || userRoleName.toLowerCase() === 'superadmin' || userRoleName.toLowerCase() === 'super_admin';

        if (!isSuperAdmin) {
            return reply.code(403).send({
                success: false,
                message: 'Super Admin privileges required to delete workspaces.'
            });
        }

        const workspace = await prisma.workspace.findFirst({
            where: { id }
        });

        if (!workspace) {
            return reply.code(404).send({
                success: false,
                message: 'Workspace not found.'
            });
        }

        if (workspace.isDefault) {
            return reply.code(400).send({
                success: false,
                message: 'Default workspace created during organization registration cannot be deleted.'
            });
        }

        const orgWorkspaces = await prisma.workspace.findMany({
            where: { orgId: workspace.orgId },
            orderBy: { createdAt: 'asc' }
        });

        if (orgWorkspaces.length > 0 && orgWorkspaces[0].id === workspace.id) {
            return reply.code(400).send({
                success: false,
                message: 'Default workspace created during organization registration cannot be deleted.'
            });
        }

        // 1. Find all projects in this workspace
        const workspaceProjects = await prisma.project.findMany({
            where: { workspaceId: id },
            select: { id: true }
        }).catch(() => []);
        const projectIds = workspaceProjects.map(p => p.id);

        // 2. Find all folders in this workspace
        const workspaceFolders = await prisma.folder.findMany({
            where: { workspaceId: id },
            select: { id: true }
        }).catch(() => []);
        const folderIds = workspaceFolders.map(f => f.id);

        // 3. Find all assets in this workspace (directly, or via folders/projects)
        const assetsToDelete = await prisma.asset.findMany({
            where: {
                OR: [
                    { workspaceId: id },
                    { ownerType: 'WORKSPACE', ownerId: id },
                    ...(projectIds.length > 0 ? [{ ownerType: 'PROJECT', ownerId: { in: projectIds } }] : []),
                    ...(folderIds.length > 0 ? [{ folderId: { in: folderIds } }] : [])
                ]
            },
            include: { files: true }
        }).catch(() => []);

        const assetIds = assetsToDelete.map(a => a.id);

        // 4. Delete file objects from Backblaze B2 Cloud & update org storage usage
        for (const asset of assetsToDelete) {
            let assetSizeBytes = 0;
            if (asset.files && asset.files.length > 0) {
                for (const f of asset.files) {
                    assetSizeBytes += Number(f.sizeBytes || 0);
                    if (f.filePath && (await b2()).isEnabled()) {
                        try {
                            await (await b2()).deleteFile(f.filePath);
                            await (await b2()).permanentlyDeleteFile(f.filePath);
                        } catch (b2Err) {
                            console.warn(`[Workspace Delete] Could not delete B2 key ${f.filePath}:`, b2Err.message);
                        }
                    }
                }
            }

            if (assetSizeBytes > 0 && (asset.orgId || workspace.orgId)) {
                try {
                    await recordStorageDelta(prisma, {
                        orgId: asset.orgId || workspace.orgId,
                        deltaBytes: -assetSizeBytes,
                        assetId: asset.id,
                        reason: 'workspace_permanent_delete',
                    });
                } catch (dErr) {
                    console.warn('[Workspace Delete] Failed to record storage delta:', dErr.message);
                }
            }
        }

        // 5. Purge asset records from Database
        if (assetIds.length > 0) {
            await prisma.assetFile.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.assetMetadata.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.assetTag.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.assetUser.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.assetGroup.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.collectionAsset.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.annotation.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.projectSource.deleteMany({ where: { assetId: { in: assetIds } } }).catch(() => null);
            await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }).catch(() => null);
        }

        // 6. Purge folder records from Database
        if (folderIds.length > 0) {
            await prisma.projectSource.deleteMany({ where: { folderId: { in: folderIds } } }).catch(() => null);
            await prisma.folderUser.deleteMany({ where: { folderId: { in: folderIds } } }).catch(() => null);
            await prisma.favorite.deleteMany({ where: { folderId: { in: folderIds } } }).catch(() => null);
            await prisma.folder.deleteMany({ where: { id: { in: folderIds } } }).catch(() => null);
        }

        // 7. Purge project records from Database
        if (projectIds.length > 0) {
            await prisma.projectSource.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => null);
            await prisma.projectUser.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => null);
            await prisma.projectGroup.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => null);
            await prisma.projectTag.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => null);
            await prisma.favorite.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => null);
            await prisma.project.deleteMany({ where: { id: { in: projectIds } } }).catch(() => null);
        }

        // 8. Purge workspace groups & users
        await prisma.workspaceGroup.deleteMany({ where: { workspaceId: id } }).catch(() => { });
        await prisma.workspaceUser.deleteMany({ where: { workspaceId: id } }).catch(() => { });
        await prisma.annotationGroup.deleteMany({ where: { workspaceId: id } }).catch(() => { });

        // 9. Delete the workspace
        await prisma.workspace.delete({ where: { id } });

        logSuccess(ACTIVITY_NAME.WORKSPACE_DELETED || 'WORKSPACE_DELETED', `Workspace ${workspace.name} and all projects/files permanently deleted.`, request);
        return reply.code(200).send({
            success: true,
            message: 'Workspace and all associated projects, folders, and files permanently deleted.'
        });
    } catch (error) {
        console.error('Error deleting workspace:', error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.getPendingOrDeletedFolderIds = getPendingOrDeletedFolderIds;
module.exports.removeWorkspaceMember = async (request, reply) => {
    try {
        const { id: workspaceId, memberId } = request.params;
        const hasAccess = await assertWorkspaceAccess(prisma, request.user, workspaceId);
        if (!hasAccess) {
            return reply.code(403).send({ success: false, message: 'Forbidden' });
        }

        // Prevent removing Owner
        const member = await prisma.workspaceUser.findFirst({
            where: {
                workspaceId,
                OR: [{ id: memberId }, { userId: memberId }]
            }
        });

        if (member && member.memberType === 'OWNER') {
            return reply.code(403).send({ success: false, message: 'Cannot remove the owner of the workspace.' });
        }

        await prisma.workspaceUser.deleteMany({
            where: {
                workspaceId,
                OR: [
                    { id: memberId },
                    { userId: memberId }
                ]
            }
        });

        await prisma.workspaceGroup.deleteMany({
            where: {
                workspaceId,
                OR: [
                    { id: memberId },
                    { groupId: memberId }
                ]
            }
        });

        return reply.send({
            success: true,
            message: 'Workspace access removed successfully.'
        });
    } catch (error) {
        console.error('Error removing workspace member:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to remove workspace member.'
        });
    }
};

module.exports.searchWorkspaceMembers = async (request, reply) => {
    try {
        const { id: workspaceId } = request.params;
        const { q = '' } = request.query;

        const normalizedQuery = q.trim().toLowerCase();
        if (!normalizedQuery) {
            return reply.send({ success: true, users: [], groups: [] });
        }

        const orgId = request.user?.orgId;
        if (!orgId) {
            return reply.code(403).send({ success: false, message: 'No org associated with user.' });
        }

        // Fetch already-added workspace members so we can exclude them
        const existingUsers = await prisma.workspaceUser.findMany({
            where: { workspaceId },
            select: { userId: true }
        });
        const existingGroups = await prisma.workspaceGroup.findMany({
            where: { workspaceId },
            select: { groupId: true }
        });
        const existingUserIds = new Set(existingUsers.map(u => u.userId));
        const existingGroupIds = new Set(existingGroups.map(g => g.groupId));

        // Search org users by name or email
        const users = await prisma.user.findMany({
            where: {
                orgId,
                OR: [
                    { name: { contains: normalizedQuery, mode: 'insensitive' } },
                    { email: { contains: normalizedQuery, mode: 'insensitive' } }
                ]
            },
            select: { id: true, name: true, email: true, avatarUrl: true },
            take: 5
        });

        // Search org groups by name
        const groups = await prisma.userGroup.findMany({
            where: {
                orgId,
                name: { contains: normalizedQuery, mode: 'insensitive' }
            },
            select: { id: true, name: true, description: true },
            take: 5
        });

        return reply.send({
            success: true,
            users: users
                .filter(u => !existingUserIds.has(u.id))
                .map(u => ({
                    id: u.id,
                    name: u.name || u.email.split('@')[0],
                    email: u.email,
                    avatarUrl: u.avatarUrl || null,
                    isOrganizationMember: true
                })),
            groups: groups
                .filter(g => !existingGroupIds.has(g.id))
                .map(g => ({
                    id: g.id,
                    name: g.name,
                    description: g.description || ''
                }))
        });
    } catch (error) {
        console.error('Error searching workspace members:', error);
        return reply.code(500).send({ success: false, message: 'Failed to search members.' });
    }
};

module.exports.addWorkspaceMember = async (request, reply) => {
    try {
        const { id: workspaceId } = request.params;
        const { email, memberType, accessLevel = 'Full Access', groupId, sendInviteEmail = false } = request.body;

        const hasAccess = await assertWorkspaceAccess(prisma, request.user, workspaceId);
        if (!hasAccess) {
            return reply.code(403).send({ success: false, message: 'Forbidden' });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { organization: true }
        });

        if (!workspace) {
            return reply.code(404).send({ success: false, message: 'Workspace not found.' });
        }

        const inviterName = request.user?.name || request.user?.email || 'A team member';
        const orgId = request.user?.orgId;
        const appUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");

        if (groupId) {
            const group = await prisma.userGroup.findUnique({
                where: { id: groupId },
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, email: true, orgId: true } }
                        }
                    }
                }
            });
            if (!group) {
                return reply.code(404).send({ success: false, message: 'Group not found.' });
            }
            let resolvedAccessLevelId = null;
            if (accessLevel) {
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(accessLevel);
                const lvl = await prisma.accessLevel.findFirst({ where: isUuid ? { id: accessLevel } : { OR: [{ title: accessLevel }, { name: accessLevel }] } });
                if (lvl) resolvedAccessLevelId = lvl.id;
            }
            await prisma.workspaceGroup.upsert({
                where: { workspaceId_groupId: { workspaceId, groupId: group.id } },
                update: { accessLevelId: resolvedAccessLevelId || accessLevel },
                create: {
                    workspaceId,
                    groupId: group.id,
                    accessLevelId: resolvedAccessLevelId || accessLevel,
                }
            }).catch(() => { });

            return reply.send({ success: true, message: 'Group added to workspace.' });
        }

        if (!email) {
            return reply.code(400).send({ success: false, message: 'Email or group is required.' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

        if (!user) {
            return reply.code(404).send({ success: false, message: 'User not found.', notFound: true });
        }

        const effectiveMemberType = user.orgId === orgId ? 'MEMBER' : 'GUEST';

        if ((workspace.visibility === 'public' || workspace.visibility === 'PUBLIC') && effectiveMemberType === 'MEMBER') {
            return reply.code(400).send({
                success: false,
                message: 'Organization members already have access to this public workspace.',
                orgMemberInPublic: true
            });
        }

        let resolvedAccessLevelId = null;
        if (accessLevel) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(accessLevel);
            const lvl = await prisma.accessLevel.findFirst({ where: isUuid ? { id: accessLevel } : { OR: [{ title: accessLevel }, { name: accessLevel }] } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        } else {
            const lvl = await prisma.accessLevel.findFirst({ where: { name: 'FULL_ACCESS' } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        }

        await prisma.workspaceUser.upsert({
            where: { workspaceId_userId: { workspaceId, userId: user.id } },
            update: {
                accessLevelId: resolvedAccessLevelId || accessLevel,
                memberType: effectiveMemberType
            },
            create: {
                workspaceId,
                userId: user.id,
                accessLevelId: resolvedAccessLevelId || accessLevel,
                memberType: effectiveMemberType,
            }
        }).catch((err) => { console.error("Failed to add workspace member:", err) });

        return reply.send({
            success: true,
            message: `${effectiveMemberType} added to workspace successfully.`,
            memberType: effectiveMemberType,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl
            }
        });
    } catch (error) {
        console.error('Error adding workspace member:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to add workspace member.'
        });
    }
};

module.exports.updateWorkspaceMemberAccess = async (request, reply) => {
    try {
        const { id: workspaceId, memberId } = request.params;
        const { accessLevel } = request.body;

        const hasAccess = await assertWorkspaceAccess(prisma, request.user, workspaceId);
        if (!hasAccess) {
            return reply.code(403).send({ success: false, message: 'Forbidden' });
        }

        let resolvedAccessLevelId = null;
        if (accessLevel) {
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(accessLevel);
            const lvl = await prisma.accessLevel.findFirst({ where: isUuid ? { id: accessLevel } : { OR: [{ title: accessLevel }, { name: accessLevel }] } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        }

        await prisma.workspaceUser.updateMany({
            where: {
                workspaceId,
                OR: [{ id: memberId }, { userId: memberId }]
            },
            data: { accessLevelId: resolvedAccessLevelId || accessLevel }
        });

        await prisma.workspaceGroup.updateMany({
            where: {
                workspaceId,
                OR: [{ id: memberId }, { groupId: memberId }]
            },
            data: { accessLevelId: resolvedAccessLevelId || accessLevel }
        });

        return reply.send({
            success: true,
            message: 'Workspace access updated successfully.'
        });
    } catch (error) {
        console.error('Error updating workspace member access:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to update workspace member access.'
        });
    }
};
