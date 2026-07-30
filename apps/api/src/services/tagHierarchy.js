const prisma = require('../utils/prisma');

const MAX_TAG_DEPTH = 5;

/**
 * Walk up the parent chain and return all ancestor tag IDs (not including the tag itself).
 * e.g. Episode 5 → [Season 2 id, Star Wars id]
 */
async function expandAncestors(tagIds) {
    const allIds = new Set(tagIds);
    const queue = [...tagIds];

    while (queue.length > 0) {
        const batch = queue.splice(0, queue.length);
        const tags = await prisma.tag.findMany({
            where: { id: { in: batch }, parentId: { not: null } },
            select: { id: true, parentId: true },
        });

        for (const tag of tags) {
            if (tag.parentId && !allIds.has(tag.parentId)) {
                allIds.add(tag.parentId);
                queue.push(tag.parentId);
            }
        }
    }

    return [...allIds];
}

/**
 * Check if setting `parentId` as the parent of `tagId` would create a cycle.
 * Returns true if it's safe (no cycle), false if a cycle would occur.
 */
async function assertNoCycle(tagId, parentId) {
    if (!parentId) return true;  // no parent = no cycle
    if (tagId === parentId) return false; // direct self-loop

    // Walk ancestors of `parentId` — if we ever reach `tagId`, it's a cycle
    let current = parentId;
    while (current) {
        const tag = await prisma.tag.findUnique({
            where: { id: current },
            select: { parentId: true },
        });
        if (!tag) break;
        if (tag.parentId === tagId) return false; // cycle detected
        current = tag.parentId;
    }
    return true;
}

/**
 * Calculate the depth of a tag (root = 1).
 * Depth is the number of ancestors + 1.
 */
async function getDepth(tagId) {
    let depth = 1;
    let current = tagId;

    for (let i = 0; i < MAX_TAG_DEPTH + 1; i++) {
        const tag = await prisma.tag.findUnique({
            where: { id: current },
            select: { parentId: true },
        });
        if (!tag || !tag.parentId) break;
        depth++;
        current = tag.parentId;
    }

    return depth;
}

/**
 * Get full ancestor chain for a tag (from root to immediate parent).
 * Returns an array of tag objects: [{ id, name, color, scope }, ...]
 */
async function getAncestors(tagId) {
    const ancestors = [];
    let current = tagId;

    while (current) {
        const tag = await prisma.tag.findUnique({
            where: { id: current },
            select: { id: true, name: true, color: true, scope: true, parentId: true },
        });
        if (!tag) break;
        if (tag.id !== tagId) ancestors.unshift(tag); // exclude the tag itself
        current = tag.parentId;
    }

    return ancestors;
}

module.exports = { expandAncestors, assertNoCycle, getDepth, getAncestors, MAX_TAG_DEPTH };
