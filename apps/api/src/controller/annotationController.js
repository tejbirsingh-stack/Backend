// Get Annotations Media 
const emailService = require('../services/email-service');
const { createNotification } = require('./notificationController');
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
                        email: true
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
                    avatarUrl: ann.data?.author?.avatarUrl || null,
                    initials: (ann.user.name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'
                } : null,
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

// Save Annotations Media
module.exports.saveMediaAnnotations = async (request, reply) => {
    try {
        const { mediaId } = request.params;
        const userId = request.user.id;
        const orgId = request.user.orgId;
        const { id, type, data, videoTimestamp, parentId } = request.body;

        if (!type) {
            return reply.code(400).send({ success: false, error: "Type is Required!" });
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

        // --- SENDGRID EMAIL NOTIFICATIONS ---
        // Fire asynchronously to avoid blocking the response
        if (data && data.text && data.text.trim().length > 0) {
            (async () => {
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
                    const videoUrl = `${process.env.APP_URL || 'http://localhost:3002'}/media/${mediaId}`;

                    // Fetch organization users to check for @mentions
                    const orgUsers = await request.server.prisma.user.findMany({
                        where: { orgId: orgId },
                        select: { id: true, name: true, email: true }
                    });

                    // Find who is mentioned in commentText (e.g. "@Anil Jangra")
                    const mentionedUsers = orgUsers.filter(u => {
                        if (!u.name || !u.email || u.id === userId) return false;
                        const nameEscaped = escapeRegExp(u.name);
                        const mentionPattern = new RegExp(`@${nameEscaped}\\b`, 'i');
                        return mentionPattern.test(commentText);
                    });

                    if (mentionedUsers.length > 0) {
                        for (const u of mentionedUsers) {
                            await emailService.sendMentionNotificationEmail(
                                u.email,
                                u.name || 'User',
                                commenterName,
                                videoName,
                                commentText,
                                videoUrl
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
                                    videoUrl
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

        return reply.code(201).send({
            success: true,
            annotations: newAnnotation,
        });
    } catch (error) {
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
            (async () => {
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
                    const videoUrl = `${process.env.APP_URL || 'http://localhost:3002'}/media/${existing.assetId}`;

                    // Fetch organization users to check for @mentions
                    const orgUsers = await request.server.prisma.user.findMany({
                        where: { orgId: request.user.orgId },
                        select: { id: true, name: true, email: true }
                    });

                    // Find who is mentioned in commentText (e.g. "@Anil Jangra")
                    const mentionedUsers = orgUsers.filter(u => {
                        if (!u.name || !u.email || u.id === userId) return false;
                        const nameEscaped = escapeRegExp(u.name);
                        const mentionPattern = new RegExp(`@${nameEscaped}\\b`, 'i');
                        return mentionPattern.test(commentText);
                    });

                    if (mentionedUsers.length > 0) {
                        for (const u of mentionedUsers) {
                            await emailService.sendMentionNotificationEmail(
                                u.email,
                                u.name || 'User',
                                commenterName,
                                videoName,
                                commentText,
                                videoUrl
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
                                    videoUrl
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

        return reply.send({
            success: true,
            annotations: update,
        });
    } catch (error) {
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

        if (existing.userId !== userId) {
            return reply.code(403).send({ success: false, error: "Forbidden: You can only delete your own annotations." });
        }

        await request.server.prisma.annotation.delete({
            where: { id },
        });

        return reply.send({
            success: true,
            message: "Annotation deleted successfully",
        });
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: "Failed to delete annotation",
            message: error.message,
        });
    }
}