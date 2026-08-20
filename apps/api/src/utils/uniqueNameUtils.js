const path = require('path');

/**
 * Generates a unique name within a workspace for a specific item type.
 * @param {object} prisma - Prisma client instance
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} originalName - The desired name (e.g., "Design" or "image.png")
 * @param {string} itemType - "folder", "project", or "asset"
 * @returns {Promise<string>} - A unique name like "Design (1)" or "image (1).png"
 */
async function generateUniqueWorkspaceName(prisma, workspaceId, originalName, itemType) {
    if (!workspaceId || !originalName) return originalName;

    let baseName = originalName;
    let extension = '';

    // Escape special characters for ILIKE query
    const escapedBaseName = baseName.replace(/[%_\\]/g, '\\$&');
    
    // We want to match: "BaseName" or "BaseName (N)"
    // Since SQL ILIKE doesn't easily do regex, we can fetch items starting with BaseName 
    // and process them in memory.
    
    let existingItems = [];

    if (itemType === 'folder') {
        existingItems = await prisma.folder.findMany({
            where: {
                workspaceId,
                name: {
                    startsWith: baseName,
                    mode: 'insensitive'
                }
            },
            select: { name: true }
        });
    } else if (itemType === 'project') {
        existingItems = await prisma.project.findMany({
            where: {
                workspaceId,
                name: {
                    startsWith: baseName,
                    mode: 'insensitive'
                },
                status: { notIn: ['deleted', 'trash'] }
            },
            select: { name: true }
        });
    } else if (itemType === 'asset') {
        existingItems = await prisma.asset.findMany({
            where: {
                workspaceId,
                title: {
                    startsWith: baseName,
                    mode: 'insensitive'
                },
                status: { notIn: ['deleted', 'trash'] }
            },
            select: { title: true }
        });
    } else {
        return originalName;
    }

    if (existingItems.length === 0) {
        return originalName;
    }

    // Extract exactly matching names and (N) names
    const exactNameLower = baseName.toLowerCase();
    
    // Pattern to match "BaseName" or "BaseName (N)"
    // The escape is needed because of the parentheses
    const pattern = new RegExp(`^${baseName.replace(/[-/\\\\^$*+?.()|[\\]{}]/g, '\\$&')}(?: \\((\\d+)\\))?$`, 'i');

    let isExactTaken = false;
    let maxNumber = 0;

    for (const item of existingItems) {
        const itemName = (item.name || item.title || '').trim();
        
        let itemBaseForMatch = itemName;

        if (itemBaseForMatch.toLowerCase() === exactNameLower) {
            isExactTaken = true;
        } else {
            const match = itemBaseForMatch.match(pattern);
            if (match) {
                if (match[1]) { // It has a number in parentheses
                    const num = parseInt(match[1], 10);
                    if (num > maxNumber) {
                        maxNumber = num;
                    }
                }
            }
        }
    }

    if (!isExactTaken) {
        return originalName; // Base name is still available
    }

    // Return the next available number
    const nextNumber = maxNumber + 1;
    return `${baseName} (${nextNumber})${extension}`;
}

module.exports = { generateUniqueWorkspaceName };
