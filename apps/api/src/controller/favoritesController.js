const prisma = require('../utils/prisma');

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
            return reply.code(200).send({ success: true, message: 'Removed from favorites', data: { isFavorite: false } });
        } else {
            const data = { userId };
            if (type === 'asset') data.assetId = id;
            if (type === 'folder') data.folderId = id;
            if (type === 'project') data.projectId = id;

            const newFavorite = await prisma.favorite.create({ data });
            return reply.code(201).send({ success: true, message: 'Added to favorites', data: { isFavorite: true, favorite: newFavorite } });
        }
    } catch (error) {
        console.error(error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.getFavorites = async (request, reply) => {
    try {
        const { id: userId } = request.user;
        const favorites = await prisma.favorite.findMany({
            where: { userId },
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
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};
