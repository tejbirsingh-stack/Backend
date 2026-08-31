// Get Annotations Media 
const emailService = require('../services/email-service');
const { createNotification } = require('./notificationController');
const { resolveOrgBranding } = require('../services/branding.service');
const { logSuccess, logError, ACTIVITY_NAME, buildItemPath } = require('../lib/audit-log');
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
module.exports.getMediaAnnotations = async (request, reply) => {
    try {
        const { mediaId } = request.params;
        const userId = request.user.id;
        const annotations = await request.server.prisma.annotation.findMany({
            where: {
                assetId: mediaId,
                orgId: request.user.orgId, // collaborators in the same org can see annotations
            },
            orderBy: {
                createdAt: "asc",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatarUrl: true
                    }
                }
            }
        });

        return reply.send({
            success: true,
            annotations: annotations.map((ann) => ({
                id: ann.id,
                parentId: ann.data?.parentId || null,
                type: ann.type,
                data: ann.data,
                videoTimestamp: ann.videoTimestamp ? Number(ann.videoTimestamp) : null,
                resolved: ann.resolved,
                userId: ann.user?.id,
                author: ann.user ? {
                    name: ann.user.name || 'Unknown User',
                    email: ann.user.email,
                    avatarUrl: ann.user.avatarUrl || ann.data?.author?.avatarUrl || null,
                    initials: (ann.user.name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U',
                    isGuest: false,
                } : ((ann.guestName || ann.guestEmail || ann.data?.guestName || ann.data?.guestEmail) ? {
                    name: (ann.guestName || ann.data?.guestName)
                        ? ((ann.guestEmail || ann.data?.guestEmail)
                            ? `${ann.guestName || ann.data?.guestName} (${ann.guestEmail || ann.data?.guestEmail})`
                            : (ann.guestName || ann.data?.guestName))
                        : (ann.guestEmail || ann.data?.guestEmail || 'Guest User'),
                    email: ann.guestEmail || ann.data?.guestEmail || null,
                    avatarUrl: null,
                    initials: ((ann.guestName || ann.data?.guestName || ann.guestEmail || ann.data?.guestEmail || 'G')[0] || 'G').toUpperCase(),
                    isGuest: true,
                } : null),
                readByUsers: ann.data?.readByUsers || [],
                unread: Boolean(
                    ((ann.userId && ann.userId !== userId) || (!ann.userId && (ann.guestName || ann.guestEmail || ann.data?.guestEmail))) &&
                    !(ann.data?.readByUsers || []).includes(userId)
                ),
                createdAt: ann.createdAt,
                updatedAt: ann.updatedAt, 
            })),    
        });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to retrieve annotations",
            message: error.message,
        });
    }
}

module.exports.saveMediaAnnotations = async (request, reply) => {
    try {
        const { mediaId } = request.params;
        const userId = request.user.id;
        const orgId = request.user.orgId;
        const { id, type, data, videoTimestamp, parentId } = request.body;

        if (!type) {
            return reply.code(400).send({ success: false, error: "Type is Required!" });
        }

        const targetAsset = await request.server.prisma.asset.findUnique({
            where: { id: mediaId },
            select: { globalMedia: true }
        });
        if (targetAsset?.globalMedia) {
            return reply.code(403).send({ success: false, error: "Annotations and comments are disabled for global starter assets." });
        }

        // Handle PAGE_STATE upsert to allow frontend to easily sync everything at once
        if (type === 'PAGE_STATE') {
            const existing = await request.server.prisma.annotation.findFirst({
                where: { assetId: mediaId, userId, type: 'PAGE_STATE' }
            });
            
            if (existing) {
                const update = await request.server.prisma.annotation.update({
                    where: { id: existing.id },
                    data: { data: data || {}, videoTimestamp: videoTimestamp !== undefined ? videoTimestamp : null }
                });
                return reply.code(200).send({ success: true, annotations: update });
            }
        }

        const newAnnotation = await request.server.prisma.annotation.create({
            data: {
                id: id || undefined, 
                orgId,
                assetId: mediaId,
                userId,
                type,
                data: { ...(data || {}), parentId: parentId || null },
                videoTimestamp: videoTimestamp !== undefined ? videoTimestamp : null,
                resolved: false,
            },
        });

        // --- AUTO-UPDATE REVIEW STATUS TO IN-PROGRESS ---
        // If the asset is currently 'New' or doesn't have a status, adding an annotation means it's now 'In-Progress'
        try {
            const assetMetadata = await request.server.prisma.assetMetadata.findUnique({
                where: { assetId: mediaId }
            });
            const currentProps = typeof assetMetadata?.customProperties === 'object' && assetMetadata.customProperties ? assetMetadata.customProperties : {};
            
            if (!currentProps.reviewStatus || currentProps.reviewStatus === 'New') {
                const updatedProps = { ...currentProps, reviewStatus: 'In-Progress' };
                if (assetMetadata) {
                    await request.server.prisma.assetMetadata.update({
                        where: { assetId: mediaId },
                        data: { customProperties: updatedProps }
                    });
                } else {
                    await request.server.prisma.assetMetadata.create({
                        data: { assetId: mediaId, customProperties: updatedProps }
                    });
                }
            }
        } catch (err) {
            request.log.error('Failed to auto-update review status to In-Progress:', err);
        }

        // --- SENDGRID EMAIL NOTIFICATIONS ---
        // Fire asynchronously to avoid blocking the response
        if (data && data.text && data.text.trim().length > 0) {
            await (async () => {
                try {
                    const commentText = data.text;
                    const commenter = await request.server.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
                    const video = await request.server.prisma.asset.findUnique({ 
                        where: { id: mediaId }, 
                        select: { 
                            title: true,
                            type: true,
                            uploadedBy: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        } 
                    });
                    
                    if (!video) return;

                    const commenterName = commenter?.name || 'A team member';
                    const mediaType = video.type === 'audio' ? 'audio' : video.type === 'image' ? 'image' : 'video';
                    const videoName = video.title || `a ${mediaType}`;
                    const appBaseUrl = request.headers.origin || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
                    const videoUrl = `${appBaseUrl.replace(/\/$/, '')}/media/${mediaId}`;

                    // Fetch organization users and groups to check for @mentions
                    const orgUsers = await request.server.prisma.user.findMany({
                        where: { orgId: orgId },
                        select: { id: true, name: true, email: true }
                    });

                    const orgGroups = await request.server.prisma.userGroup.findMany({
                        where: { orgId: orgId },
                        include: { members: { include: { user: true } } }
                    });

                    // Find who is mentioned in commentText (e.g. "@Anil Jangra")
                    const mentionedUsers = orgUsers.filter(u => {
                        if (!u.name || !u.email || u.id === userId) return false;
                        const nameEscaped = escapeRegExp(u.name);
                        const mentionPattern = new RegExp(`@${nameEscaped}\\b`, 'i');
                        return mentionPattern.test(commentText);
                    });

                    // Find if any groups are mentioned (e.g. "@Artist Team")
                    const mentionedGroups = orgGroups.filter(g => {
                        if (!g.name) return false;
                        const nameEscaped = escapeRegExp(g.name);
                        const mentionPattern = new RegExp(`@${nameEscaped}\\b`, 'i');
                        return mentionPattern.test(commentText);
                    });

                    // Combine them uniquely, excluding the commenter
                    let allUsersToNotify = [...mentionedUsers];
                    for (const group of mentionedGroups) {
                        for (const member of group.members) {
                            if (member.user && member.user.id !== userId && !allUsersToNotify.some(u => u.id === member.user.id)) {
                                allUsersToNotify.push(member.user);
                            }
                        }
                    }



                    const orgBranding = await resolveOrgBranding(request.server.prisma, orgId);

                    if (allUsersToNotify.length > 0) {
                        for (const u of allUsersToNotify) {
                            await emailService.sendMentionNotificationEmail(
                                u.email,
                                u.name || 'User',
                                commenterName,
                                videoName,
                                commentText,
                                videoUrl,
                                { orgLogoUrl: orgBranding?.logoUrl, orgName: orgBranding?.accountName }
                            );
                            await createNotification(
                                request.server,
                                u.id,
                                orgId,
                                'mention',
                                'You were mentioned',
                                `${commenterName} mentioned you on "${videoName}": "${commentText}"`,
                                mediaId
                            );
                        }
                    } else {
                        // Fallback to uploader if no mentions
                        const uploader = video.uploadedBy;
                        if (uploader && uploader.id !== userId) {
                            if (uploader.email) {
                                await emailService.sendNewAnnotationEmail(
                                    uploader.email,
                                    uploader.name || 'User',
                                    commenterName,
                                    videoName,
                                    commentText,
                                    videoUrl,
                                    { orgLogoUrl: orgBranding?.logoUrl, orgName: orgBranding?.accountName }
                                );
                            }
                            await createNotification(
                                request.server,
                                uploader.id,
                                orgId,
                                'annotation_added',
                                `New comment on your ${mediaType}`,
                                `${commenterName} commented on "${videoName}": "${commentText}"`,
                                mediaId
                            );
                        }
                    }
                } catch (err) {
                    request.log.error('Failed to send SendGrid annotation notifications:', err);
                }
            })();
        }

        if (type !== 'PAGE_STATE') {
            const itemPath = await buildItemPath(request.server.prisma, 'asset', mediaId);
            logSuccess(ACTIVITY_NAME.ANNOTATION_CREATED, `Annotation added to media "${itemPath}".`, request);
        }

        return reply.code(201).send({
            success: true,
            annotations: newAnnotation,
        });
    } catch (error) {
        logError(ACTIVITY_NAME.ANNOTATION_CREATED, "Failed to Create annotation", error, request);
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to Create annotation",
            message: error.message,
        });
    }
}

// Update Annotations Media
module.exports.updateMediaAnnotations = async (request, reply) => {
    try {
        const { id } = request.params;
        const userId = request.user.id;
        const { data, videoTimestamp, resolved } = request.body;

        // Ensure annotation exists and belongs to the user's organization
        const existing = await request.server.prisma.annotation.findFirst({
            where: { id, orgId: request.user.orgId },
        });

        if (!existing) {
            return reply.code(404).send({ success: false, error: "Annotation not found" });
        }

        const updateData = {};
        if (data !== undefined) updateData.data = data;
        if (videoTimestamp !== undefined) updateData.videoTimestamp = videoTimestamp;
        if (resolved !== undefined) updateData.resolved = resolved;

        const update = await request.server.prisma.annotation.update({
            where: { id },
            data: updateData,
        });

        // --- SENDGRID EMAIL NOTIFICATIONS (For Comments added to existing shapes) ---
        if (data && data.text && data.text.trim().length > 0 && data.text !== (existing.data?.text || '')) {
            await (async () => {
                try {
                    const commentText = data.text;
                    const commenter = await request.server.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
                    const video = await request.server.prisma.asset.findUnique({ 
                        where: { id: existing.assetId }, 
                        select: { 
                            title: true,
                            type: true,
                            uploadedBy: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        } 
                    });
                    
                    if (!video) return;

                    const commenterName = commenter?.name || 'A team member';
                    const mediaType = video.type === 'audio' ? 'audio' : video.type === 'image' ? 'image' : 'video';
                    const videoName = video.title || `a ${mediaType}`;
                    const appBaseUrl = request.headers.origin || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
                    const videoUrl = `${appBaseUrl.replace(/\/$/, '')}/media/${existing.assetId}`;

                    // Fetch organization users and groups to check for @mentions
                    const orgUsers = await request.server.prisma.user.findMany({
                        where: { orgId: request.user.orgId },
                        select: { id: true, name: true, email: true }
                    });

                    const orgGroups = await request.server.prisma.userGroup.findMany({
                        where: { orgId: request.user.orgId },
                        include: { members: { include: { user: true } } }
                    });

                    // Find who is mentioned in commentText (e.g. "@Anil Jangra")
                    const mentionedUsers = orgUsers.filter(u => {
                        if (!u.name || !u.email || u.id === userId) return false;
                        const nameEscaped = escapeRegExp(u.name);
                        const mentionPattern = new RegExp(`@${nameEscaped}\\b`, 'i');
                        return mentionPattern.test(commentText);
                    });

                    // Find if any groups are mentioned (e.g. "@Artist Team")
                    const mentionedGroups = orgGroups.filter(g => {
                        if (!g.name) return false;
                        const nameEscaped = escapeRegExp(g.name);
                        const mentionPattern = new RegExp(`@${nameEscaped}\\b`, 'i');
                        return mentionPattern.test(commentText);
                    });

                    // Combine them uniquely, excluding the commenter
                    let allUsersToNotify = [...mentionedUsers];
                    for (const group of mentionedGroups) {
                        for (const member of group.members) {
                            if (member.user && member.user.id !== userId && !allUsersToNotify.some(u => u.id === member.user.id)) {
                                allUsersToNotify.push(member.user);
                            }
                        }
                    }



                    const orgBranding = await resolveOrgBranding(request.server.prisma, request.user?.orgId);

                    if (allUsersToNotify.length > 0) {
                        for (const u of allUsersToNotify) {
                            await emailService.sendMentionNotificationEmail(
                                u.email,
                                u.name || 'User',
                                commenterName,
                                videoName,
                                commentText,
                                videoUrl,
                                { orgLogoUrl: orgBranding?.logoUrl, orgName: orgBranding?.accountName }
                            );
                            await createNotification(
                                request.server,
                                u.id,
                                request.user.orgId,
                                'mention',
                                'You were mentioned',
                                `${commenterName} mentioned you on "${videoName}": "${commentText}"`,
                                existing.assetId
                            );
                        }
                    } else {
                        // Fallback to uploader if no mentions
                        const uploader = video.uploadedBy;
                        if (uploader && uploader.id !== userId) {
                            if (uploader.email) {
                                await emailService.sendNewAnnotationEmail(
                                    uploader.email,
                                    uploader.name || 'User',
                                    commenterName,
                                    videoName,
                                    commentText,
                                    videoUrl,
                                    { orgLogoUrl: orgBranding?.logoUrl, orgName: orgBranding?.accountName }
                                );
                            }
                            await createNotification(
                                request.server,
                                uploader.id,
                                request.user.orgId,
                                'annotation_added',
                                `New comment on your ${mediaType}`,
                                `${commenterName} commented on "${videoName}": "${commentText}"`,
                                existing.assetId
                            );
                        }
                    }
                } catch (err) {
                    request.log.error('Failed to send SendGrid annotation notifications on update:', err);
                }
            })();
        }

        const itemPath = await buildItemPath(request.server.prisma, 'asset', existing.assetId);
        logSuccess(ACTIVITY_NAME.ANNOTATION_UPDATED, `Annotation updated on media "${itemPath}".`, request);

        return reply.send({
            success: true,
            annotations: update,
        });
    } catch (error) {
        logError(ACTIVITY_NAME.ANNOTATION_UPDATED, "Failed to update annotation", error, request);
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to update annotation",
            message: error.message,
        });
    }
}

// Delete Annotations Media
module.exports.deleteMediaAnnotations = async (request, reply) => {
    try {
        const { id } = request.params;
        const userId = request.user.id;

        // Ensure annotation exists and belongs to the user's organization
        const existing = await request.server.prisma.annotation.findFirst({
            where: { id, orgId: request.user.orgId }
        });

        if (!existing) {
            return reply.code(404).send({ success: false, error: "Annotation Not Found!" });
        }

        const userRole = request.user.role || '';
        const isOrgAdmin = ['Super Admin', 'Admin'].includes(userRole);
        
        let hasFullProjectAccess = false;
        
        // Check if the asset is linked to a project
        const projectSource = await request.server.prisma.projectSource.findFirst({
            where: { assetId: existing.assetId }
        });
        
        if (projectSource) {
            try {
                const { verifyProjectAccess } = require('../utils/projectAccessUtils');
                const level = await verifyProjectAccess(projectSource.projectId, request.user.id, 'Can view', request.server.prisma);
                if (level === 'Full Access') {
                    hasFullProjectAccess = true;
                }
            } catch (e) {
                // User might not have access or not Full Access
            }
        }

        if (existing.userId !== userId && !isOrgAdmin && !hasFullProjectAccess) {
            return reply.code(403).send({ success: false, error: "Forbidden: You can only delete your own annotations." });
        }

        await request.server.prisma.annotation.delete({
            where: { id },
        });

        const itemPath = await buildItemPath(request.server.prisma, 'asset', existing.assetId);
        logSuccess(ACTIVITY_NAME.ANNOTATION_DELETED, `Annotation deleted from media "${itemPath}".`, request);

        return reply.send({
            success: true,
            message: "Annotation deleted successfully",
        });
    } catch (error) {
        logError(ACTIVITY_NAME.ANNOTATION_DELETED, "Failed to delete annotation", error, request);
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to delete annotation",
            message: error.message,
        });
    }
}

module.exports.getAnnotationGroups = async (request, reply) => {
    try {
        const { mediaId } = request.params;

        const groups = await request.server.prisma.annotationGroup.findMany({
            where: {
                mediaId,
                orgId: request.user.orgId
            },
            include: {
                members: true
            }
        });

        // Format for frontend: memberIds as array of strings
        const formattedGroups = groups.map(g => ({
            id: g.id,
            name: g.name,
            createdAt: new Date(g.createdAt).getTime(),
            memberIds: g.members.map(m => m.userId)
        }));

        return reply.send({
            success: true,
            data: formattedGroups
        });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to fetch annotation groups",
            message: error.message
        });
    }
};

module.exports.createAnnotationGroup = async (request, reply) => {
    try {
        const { mediaId } = request.params;
        const { name, memberIds } = request.body;
        const { orgId } = request.user;

        if (!name || name.trim().length === 0) {
            return reply.code(400).send({ success: false, error: "Group name is required" });
        }

        // Verify media asset exists and get workspaceId
        const asset = await request.server.prisma.asset.findFirst({
            where: { id: mediaId, orgId }
        });

        if (!asset) {
            return reply.code(404).send({ success: false, error: "Media asset not found" });
        }
        
        let workspaceId;
        if (asset.ownerType === 'WORKSPACE') {
            workspaceId = asset.ownerId;
        } else if (asset.ownerType === 'FOLDER') {
            const folder = await request.server.prisma.folder.findUnique({ where: { id: asset.ownerId } });
            workspaceId = folder?.workspaceId;
        } else if (asset.ownerType === 'PROJECT') {
            const project = await request.server.prisma.project.findUnique({ where: { id: asset.ownerId } });
            if (project?.workspaceId) {
                workspaceId = project.workspaceId;
            } else if (project?.folderId) {
                const folder = await request.server.prisma.folder.findUnique({ where: { id: project.folderId } });
                workspaceId = folder?.workspaceId;
            }
        }

        if (!workspaceId) {
            return reply.code(400).send({ success: false, error: "Could not resolve workspace for this asset" });
        }

        const newGroup = await request.server.prisma.annotationGroup.create({
            data: {
                name: name.trim(),
                mediaId,
                orgId,
                workspaceId,
                members: {
                    create: memberIds.map(userId => ({
                        userId
                    }))
                }
            },
            include: {
                members: true
            }
        });

        return reply.send({
            success: true,
            data: {
                id: newGroup.id,
                name: newGroup.name,
                createdAt: new Date(newGroup.createdAt).getTime(),
                memberIds: newGroup.members.map(m => m.userId)
            }
        });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to create annotation group",
            message: error.message
        });
    }
};

module.exports.deleteAnnotationGroup = async (request, reply) => {
    try {
        const { mediaId, groupId } = request.params;
        const { orgId, id: userId } = request.user;

        const group = await request.server.prisma.annotationGroup.findFirst({
            where: { id: groupId, mediaId, orgId },
            include: { members: true }
        });

        if (!group) {
            return reply.code(404).send({ success: false, error: "Annotation group not found" });
        }

        // Only a member of the group (any member) can delete it — you can tighten this to creator-only later
        const isMember = group.members.some(m => m.userId === userId);
        if (!isMember) {
            return reply.code(403).send({ success: false, error: "You are not authorized to delete this group" });
        }

        // Find annotations using this group and reset them to private
        const annotations = await request.server.prisma.annotation.findMany({
            where: { assetId: mediaId, orgId }
        });

        const updates = annotations
            .filter(a => a.data && a.data.groupId === groupId)
            .map(a => {
                const newData = { ...a.data };
                newData.visibility = 'private';
                delete newData.groupId;
                return request.server.prisma.annotation.update({
                    where: { id: a.id },
                    data: { data: newData }
                });
            });

        if (updates.length > 0) {
            await Promise.all(updates);
        }

        await request.server.prisma.annotationGroup.delete({
            where: { id: groupId }
        });

        return reply.send({ success: true, message: "Group deleted successfully" });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to delete annotation group",
            message: error.message
        });
    }
};

module.exports.updateAnnotationGroup = async (request, reply) => {
    try {
        const { mediaId, groupId } = request.params;
        const { name, memberIds } = request.body;
        const { orgId, id: userId } = request.user;

        // Validation
        if (!name || name.trim() === '') {
            return reply.code(400).send({ success: false, error: "Group name is required" });
        }
        if (name.length > 50) {
            return reply.code(400).send({ success: false, error: "Group name cannot exceed 50 characters" });
        }
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return reply.code(400).send({ success: false, error: "Group must have at least one member" });
        }

        // Fetch existing group to check authorization
        const group = await request.server.prisma.annotationGroup.findFirst({
            where: { id: groupId, mediaId, orgId },
            include: { members: true }
        });

        if (!group) {
            return reply.code(404).send({ success: false, error: "Annotation group not found" });
        }

        // Authorization: only a member can edit
        const isMember = group.members.some(m => m.userId === userId);
        if (!isMember) {
            return reply.code(403).send({ success: false, error: "You are not authorized to edit this group" });
        }

        // Ensure current user is still in the member list to prevent self-lockout
        const finalMemberIds = memberIds.includes(userId) ? memberIds : [...memberIds, userId];

        // Execute as a transaction: Update name, delete old members, insert new members
        const [updatedGroup] = await request.server.prisma.$transaction([
            request.server.prisma.annotationGroup.update({
                where: { id: groupId },
                data: { name: name.trim() }
            }),
            request.server.prisma.annotationGroupMember.deleteMany({
                where: { groupId: groupId }
            }),
            request.server.prisma.annotationGroupMember.createMany({
                data: finalMemberIds.map(mId => ({
                    groupId: groupId,
                    userId: mId
                }))
            })
        ]);

        return reply.send({
            success: true,
            data: {
                id: updatedGroup.id,
                name: updatedGroup.name,
                createdAt: new Date(updatedGroup.createdAt).getTime(),
                memberIds: finalMemberIds
            }
        });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to update annotation group",
            message: error.message
        });
    }
};

module.exports.markAnnotationRead = async (request, reply) => {
    try {
        const { id } = request.params;
        const userId = request.user.id;
        const { unread } = request.body || {};

        const existing = await request.server.prisma.annotation.findUnique({
            where: { id }
        });

        if (!existing) {
            return reply.code(404).send({ success: false, error: 'Annotation not found' });
        }

        const currentData = existing.data || {};
        const readByUsers = Array.isArray(currentData.readByUsers) ? [...currentData.readByUsers] : [];

        let updatedUsers = readByUsers;
        if (unread) {
            updatedUsers = readByUsers.filter((uId) => uId !== userId);
        } else {
            if (!readByUsers.includes(userId)) {
                updatedUsers.push(userId);
            }
        }

        const updated = await request.server.prisma.annotation.update({
            where: { id },
            data: {
                data: {
                    ...currentData,
                    readByUsers: updatedUsers,
                }
            }
        });

        return reply.code(200).send({
            success: true,
            annotationId: id,
            unread: !!unread,
            readByUsers: updatedUsers,
        });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to mark annotation read state',
            message: error.message,
        });
    }
};