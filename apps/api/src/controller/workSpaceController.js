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

module.exports.createFolder = async (request, reply) => {
    try {
        const { id: ownerId, ownerType } = request.params; // workspace (for now) & Project later 
        const { name, parentId } = request.body;
        const { orgId: organizationId, id: userId } = request.user;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name is required.'
            });
        }

        // Validate parent folder exists (if provided)
        if (parentId) {
            const parentFolder = await prisma.folder.findUnique({
                where: {
                    id: parentId,
                    ownerId: ownerId,
                    ownerType: ownerType,
                    deletedAt: null,
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
                parentId,
                ownerType: 'WORKSPACE',
                ownerId,
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
