const prisma = require('../utils/prisma');
const crypto = require('crypto');
const { logSuccess, ACTIVITY_NAME, logError } = require('../lib/audit-log');
const emailService = require('../services/email-service');
const { getAncestors } = require('../services/tagHierarchy');
const { autoAssignAdminsToWorkspace, autoAssignAdminsToProject, assertWorkspaceAccess } = require('../services/workspace.service');
const { isOrgWideRole, resolveUserWorkspacePermissions } = require('../lib/rbac-policy');
const { verifyProjectAccess } = require('../utils/projectAccessUtils');
const { createNotification, notifyRole } = require('./notificationController');
const { ACCESS_LEVEL } = require('../lib/rolesPermissions');
const B2StorageService = require('../b2-storage.cjs');
const { recordStorageDelta } = require('../services/usage-meter.service');

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

function formatWorkspaceNameWithSuffix(value) {
    if (!value || typeof value !== "string") return "Workspace-ARK";
    let trimmed = value.trim();
    if (trimmed.endsWith("-Workspace-ARK")) {
        return trimmed;
    }
    trimmed = trimmed.replace(/-Workspace$/i, "").replace(/-ARK$/i, "").replace(/-Workspace-ARK$/i, "").trim();
    return `${trimmed}-Workspace-ARK`;
}

module.exports.storeWorkplace = async (request, reply) => {
    try {
        const { name, description, color, inviteEmails, inviteGroupIds, memberType, accessLevel } = request.body;

        // Default values for granular permissions if not provided
        const mType = memberType || 'MEMBER';
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
                color
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

                if (mType === 'GUEST') {
                    // Guest: must exist in DB, belong to a different org, and be active
                    const guestUser = await prisma.user.findFirst({
                        where: { email: email.toLowerCase().trim() }
                    });
                    if (
                        !guestUser ||
                        guestUser.status !== 'active' ||
                        !guestUser.orgId ||
                        guestUser.orgId === orgId
                    ) {
                        // Skip invalid guest: not found, inactive, no org, or same org
                        continue;
                    }
                    await prisma.workspaceUser.create({
                        data: {
                            workspaceId: workspace.id,
                            userId: guestUser.id,
                            memberType: 'GUEST',
                            accessLevelId: aLevelId
                        }
                    }).catch(() => { });
                } else {
                    // Member: must belong to the same org
                    const invitedUser = await prisma.user.findFirst({
                        where: { email: email.toLowerCase().trim(), orgId }
                    });
                    if (invitedUser && invitedUser.id !== userId) {
                        await prisma.workspaceUser.create({
                            data: {
                                workspaceId: workspace.id,
                                userId: invitedUser.id,
                                memberType: mType,
                                accessLevelId: aLevelId
                            }
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

module.exports.findAllWorkspaces = async (request, reply) => {
    try {
        const { orgId } = request.user || {};
        const userId = request.user?.id || request.user?.userId || request.user?.sub;

        if (!userId) {
            return reply.code(401).send({
                success: false,
                message: 'Unauthorized'
            });
        }

        const orConditions = [
            {
                users: {
                    some: {
                        userId: userId
                    }
                }
            }
        ];

        if (orgId) {
            orConditions.push({ orgId: orgId });
        }

        let workspaces = await prisma.workspace.findMany({
            where: {
                OR: orConditions
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Fallback: if no workspaces found, check if workspace exists in their org and add user to it
        if (workspaces.length === 0 && orgId) {
            const orgWorkspaces = await prisma.workspace.findMany({
                where: { orgId },
                orderBy: { createdAt: 'asc' }
            });
            if (orgWorkspaces.length > 0) {
                for (const ws of orgWorkspaces) {
                    await prisma.workspaceUser.upsert({
                        where: { workspaceId_userId: { workspaceId: ws.id, userId: userId } },
                        create: { workspaceId: ws.id, userId: userId },
                        update: {}
                    }).catch(() => { });
                }
                workspaces = orgWorkspaces;
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
            folders = await prisma.folder.findMany({
                where: {
                    workspaceId: id,
                },
                include: {
                    sources: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

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

        // Validate parent folder exists (if provided)
        if (parentId) {
            const parentFolder = await prisma.folder.findUnique({
                where: {
                    id: parentId,
                },
            });

            if (!parentFolder) {
                return reply.code(404).send({
                    success: false,
                    message: 'Parent folder not found.'
                });
            }
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                color,
                parentId,
                workspaceId,
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

        return reply.code(201).send({
            success: true,
            message: 'Folder created successfully.',
            data: folder
        });

    } catch (error) {
        console.error(error);

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
                            emailService.sendProjectMemberInvite(memberUser.email, {
                                projectName: project.name,
                                inviterName,
                                appUrl: `${appUrl.replace(/\/$/, '')}/home`
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
            return reply.code(404).send({ success: false, message: 'User not found.' });
        }

        const effectiveMemberType = memberType || 'Member';

        await prisma.projectUser.create({
            data: {
                projectId,
                userId: user.id,
                accessLevel: accessLevel || 'Full Access',
                memberType: effectiveMemberType,
            }
        }).catch(() => { });

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
                const orgName = project.workspace?.organization?.name || 'Noah Cloud';
                if (effectiveMemberType === 'Guest') {
                    await emailService.sendProjectGuestInvite(user.email, {
                        projectName: project.name,
                        organizationName: orgName,
                        appUrl: `${appUrl.replace(/\/$/, '')}/home`
                    }).catch(err => console.error('Failed to send guest invite email:', err));
                } else {
                    await emailService.sendProjectMemberInvite(user.email, {
                        projectName: project.name,
                        inviterName,
                        appUrl: `${appUrl.replace(/\/$/, '')}/home`
                    }).catch(err => console.error('Failed to send member invite email:', err));
                }
            } catch (e) {
                console.error('Failed to send project invite email:', e);
            }
        }

        return reply.send({
            success: true,
            message: `${effectiveMemberType} added to project successfully.`
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
        const { name, folderId, defaultTagIds, visibility = 'public', inviteEmails = [], inviteGroupIds = [], inviteAccess = 'Full Access', inviteMemberType = 'Member', sendInviteEmail = false } = request.body;
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
        if (visibility.toLowerCase() === 'private' && inviteMemberType === 'Guest' && Array.isArray(inviteEmails) && inviteEmails.length > 0) {
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
                    data: { name: year, workspaceId, parentId: null }
                });
            }

            // 2. Find or create Month folder
            let monthFolder = await prisma.folder.findFirst({
                where: { workspaceId, name: month, parentId: yearFolder.id }
            });

            if (!monthFolder) {
                monthFolder = await prisma.folder.create({
                    data: { name: month, workspaceId, parentId: yearFolder.id }
                });
            }

            finalFolderId = monthFolder.id;
            finalOwnerType = 'FOLDER';
            resolvedFolderName = monthFolder.name;
        }

        const project = await prisma.project.create({
            data: {
                name,
                ownerType: finalOwnerType,
                workspaceId,
                folderId: finalFolderId || null,
                visibility: visibility.toLowerCase(),
                createdById: userId || null,
            },
        });

        // If visibility is private, handle project invites
        if (visibility.toLowerCase() === 'private') {

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
                        memberType: 'Member',
                    }
                }).catch(() => { });
            }

            // Also auto-assign admins for private projects
            await autoAssignAdminsToProject(prisma, request.user.orgId, project.id);

            // Add invited emails
            if (Array.isArray(inviteEmails) && inviteEmails.length > 0) {
                const appUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");
                const inviterName = request.user?.name || request.user?.email || 'A team member';

                for (const email of inviteEmails) {
                    if (!email || typeof email !== 'string') continue;
                    const cleanEmail = email.toLowerCase().trim();

                    if (inviteMemberType === 'Guest') {
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
                                const organizationName = org ? org.name : 'An organization';

                                emailService.sendProjectGuestInvite(cleanEmail, {
                                    projectName: project.name,
                                    organizationName,
                                    appUrl: `${appUrl.replace(/\/$/, '')}/home`
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
                                emailService.sendProjectMemberInvite(cleanEmail, {
                                    projectName: project.name,
                                    inviterName,
                                    appUrl: `${appUrl.replace(/\/$/, '')}/home`
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
                                    emailService.sendProjectMemberInvite(memberUser.email, {
                                        projectName: project.name,
                                        inviterName,
                                        appUrl: `${appUrl.replace(/\/$/, '')}/home`
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

        return reply.code(201).send({
            success: true,
            message: 'Project created successfully.',
            data: project,
            folderId: finalFolderId,
            folderName: resolvedFolderName
        });

    } catch (error) {
        console.error(error);

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
                        { visibility: 'public' },
                        {
                            visibility: 'private',
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


        const folders = await prisma.folder.findMany({
            where: {
                parentId: id,
            },
            include: {
                sources: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

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

        const folderInfo = await prisma.folder.findUnique({
            where: { id },
            include: { sources: true }
        });

        return reply.code(200).send({
            success: true,
            message: 'Folder contents fetched successfully.',
            data: {
                folderInfo,
                media: [], // Deprecated: fetched via pagination API
                folders,
                projects
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
            where: { id: { in: Array.from(allFolderIds) } }
        }).catch(() => []);

        return reply.code(200).send({
            success: true,
            message: 'Project contents fetched successfully.',
            data: {
                media: assets,
                folders: completeFolders
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

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.updateFolder = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name } = request.body;

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

        const folder = await prisma.folder.update({
            where: { id },
            data: { name }
        });

        return reply.send({
            success: true,
            message: 'Folder renamed successfully.',
            data: folder
        });
    } catch (error) {
        console.error(error);
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

        return reply.code(200).send({
            success: true,
            message: 'Folder moved successfully.',
            data: updatedFolder
        });
    } catch (error) {
        console.error('Failed to move folder:', error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.updateProject = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name, workspaceId, visibility, status } = request.body;

        await verifyProjectAccess(id, request.user.id, 'Full Access');

        if (name === undefined && workspaceId === undefined && visibility === undefined && status === undefined) {
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

        const dataToUpdate = {};
        if (name !== undefined) dataToUpdate.name = name;
        if (workspaceId !== undefined && workspaceId) {
            dataToUpdate.workspaceId = workspaceId;
            dataToUpdate.ownerType = 'WORKSPACE';
        }
        if (visibility !== undefined) dataToUpdate.visibility = visibility;
        if (status !== undefined) dataToUpdate.status = status.toLowerCase();

        const project = await prisma.project.update({
            where: { id },
            data: dataToUpdate
        });

        return reply.send({
            success: true,
            message: 'Project updated successfully.',
            data: project
        });
    } catch (error) {
        console.error("Error in updateProject:", error);
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
                            if (f.filePath && b2Storage.isEnabled()) {
                                try {
                                    await b2Storage.deleteFile(f.filePath);
                                    await b2Storage.permanentlyDeleteFile(f.filePath);
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
                                if (f.filePath && b2Storage.isEnabled()) {
                                    try {
                                        await b2Storage.deleteFile(f.filePath);
                                        await b2Storage.permanentlyDeleteFile(f.filePath);
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

                return reply.code(200).send({
                    success: true,
                    message: `Project deletion request for '${projectName}' submitted for Super Admin review.`
                });
            }
        }
    } catch (error) {
        console.error('Failed to delete project / selected files:', error);
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

        return reply.code(200).send({
            success: true,
            message: `Project '${projectName}' and all its associated files/folders restored to Active successfully.`
        });
    } catch (error) {
        console.error('Failed to restore project:', error);
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