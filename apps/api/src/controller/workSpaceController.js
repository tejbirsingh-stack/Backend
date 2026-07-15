const prisma = require('../utils/prisma');
module.exports.storeWorkplace = async (request, reply) => {
    try {
        const userId = request.user.id;
        const { orgId: organizationId } = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });
        const { name, description, color } = request.body;

        if (!organizationId || !name) {
            return reply.code(400).send({
                success: false,
                message: 'Organization ID and Name are required.'
            });
        }
        const workspace = await prisma.workspace.create({
            data: {
                organizationId,
                name,
                description,
                color
            }
        });

        return reply.code(201).send({
            success: true,
            message: 'Workspace created successfully.',
            data: workspace
        });

    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findAllWorkspaces = async (request, reply) => {
    try {
        const workspaces = await prisma.workspace.findMany({
            where: {
                deletedAt: null
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return reply.code(200).send({
            success: true,
            message: 'Workspaces fetched successfully.',
            data: workspaces
        });

    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findWorkspaceMedia = async (request, reply) => {
    try {
        const { id } = request.params;  //workspace Id
        const mediaAssets = await prisma.mediaAsset.findMany({
            where: {
                ownerType: 'WORKSPACE',
                ownerId: id,
                deletedAt: null,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return reply.code(200).send({
            success: true,
            message: 'Media fetched successfully.',
            data: mediaAssets
        });

    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};