// Get Annotations Media 
module.exports.getMediaAnnotations = async (request, reply) => {
    try {
        const { mediaId } = request.params;
        const userId = request.user.id;
        const annotations = await request.server.prisma.annotation.findMany({
            where: {
                assetId: mediaId,
                userId: userId, // user only sees their own annotations
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        return reply.send({
            success: true,
            annotations: annotations.map((ann) => ({
                id: ann.id,
                type: ann.type,
                data: ann.data,
                videoTimestamp: ann.videoTimestamp ? Number(ann.videoTimestamp) : null,
                resolved: ann.resolved,
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
        const { type, data, videoTimestamp } = request.body;

        if (!type) {
            return reply.code(400).send({ success: false, error: "Type is Required!" });
        }

        const newAnnotation = await request.server.prisma.annotation.create({
            data: {
                orgId,
                assetId: mediaId,
                userId,
                type,
                data: data || {},
                videoTimestamp: videoTimestamp !== undefined ? videoTimestamp : null,
                resolved: false,
            },
        });

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

        // Ensure annotation exists and belongs to user
        const existing = await request.server.prisma.annotation.findFirst({
            where: { id, userId },
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

        // Ensure annotation exists and belongs to user
        const existing = await request.server.prisma.annotation.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return reply.code(404).send({ success: false, error: "Annotation Not Found!" });
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