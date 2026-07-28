const prisma = require('../utils/prisma');
const { logSuccess, logError, ACTIVITY_NAME } = require('../lib/audit-log');

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

module.exports.toggleFavorite = async (request, reply) => {
    try {
        const { id: userId } = request.user;
        const { type, id } = request.body; // type: 'asset' | 'folder' | 'project'

        if (!['asset', 'folder', 'project'].includes(type)) {
            return reply.code(400).send({ success: false, message: 'Invalid type provided' });
        }

        let existingFavorite = null;
        let whereClause = { userId };

        if (type === 'asset') {
            whereClause.assetId = id;
            existingFavorite = await prisma.favorite.findFirst({ where: whereClause });
        } else if (type === 'folder') {
            whereClause.folderId = id;
            existingFavorite = await prisma.favorite.findFirst({ where: whereClause });
        } else if (type === 'project') {
            whereClause.projectId = id;
            existingFavorite = await prisma.favorite.findFirst({ where: whereClause });
        }

        if (existingFavorite) {
            await prisma.favorite.delete({ where: { id: existingFavorite.id } });
            
            const itemPath = await buildItemPath(prisma, type, id);
            logSuccess(ACTIVITY_NAME.FAVORITE_REMOVED, `Removed ${itemPath} from favorites.`, request);
            
            return reply.code(200).send({ success: true, message: 'Removed from favorites', data: { isFavorite: false } });
        } else {
            let workspaceId = null;
            if (type === 'asset') {
                const asset = await prisma.asset.findUnique({ where: { id } });
                if (asset) {
                    if (asset.ownerType === 'WORKSPACE') workspaceId = asset.ownerId;
                    else if (asset.ownerType === 'FOLDER') {
                        const f = await prisma.folder.findUnique({ where: { id: asset.ownerId }, select: { workspaceId: true } });
                        if (f) workspaceId = f.workspaceId;
                    } else if (asset.ownerType === 'PROJECT') {
                        const p = await prisma.project.findUnique({ where: { id: asset.ownerId }, select: { workspaceId: true } });
                        if (p) workspaceId = p.workspaceId;
                    }
                }
            } else if (type === 'folder') {
                const folder = await prisma.folder.findUnique({ where: { id }, select: { workspaceId: true } });
                if (folder) workspaceId = folder.workspaceId;
            } else if (type === 'project') {
                const project = await prisma.project.findUnique({ where: { id }, select: { workspaceId: true } });
                if (project) workspaceId = project.workspaceId;
            }

            const data = { userId };
            if (type === 'asset') data.assetId = id;
            if (type === 'folder') data.folderId = id;
            if (type === 'project') data.projectId = id;
            if (workspaceId) data.workspaceId = workspaceId;


            const newFavorite = await prisma.favorite.create({ data });
            
            const itemPath = await buildItemPath(prisma, type, id);
            logSuccess(ACTIVITY_NAME.FAVORITE_ADDED, `Added ${itemPath} to favorites.`, request);

            return reply.code(201).send({ success: true, message: 'Added to favorites', data: { isFavorite: true, favorite: newFavorite } });
        }
    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME.FAVORITE_ADDED, 'Failed to toggle favorite.', request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.getFavorites = async (request, reply) => {
    try {
        const { id: userId } = request.user;
        const { workspaceId } = request.query;

        const whereClause = { userId };
        if (workspaceId) {
            whereClause.workspaceId = workspaceId;
        }

        const favorites = await prisma.favorite.findMany({
            where: whereClause,
            include: {
                asset: true,
                folder: true,
                project: true,
            }
        });

        return reply.code(200).send({
            success: true,
            data: favorites
        });
    } catch (error) {
        console.error(error);
        logError('FETCH FAVORITES', 'Failed to fetch favorites.', request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};
