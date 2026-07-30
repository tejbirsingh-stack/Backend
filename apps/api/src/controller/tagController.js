const prisma = require('../utils/prisma');
const { logSuccess, logError, ACTIVITY_NAME } = require('../lib/audit-log');
const { assertNoCycle, getDepth, getAncestors, MAX_TAG_DEPTH } = require('../services/tagHierarchy');

const VALID_SCOPES = ['personal', 'company', 'project'];

// ─────────────────────────────────────────────────────────────
// Helper: build a standard tag DTO (adds parentName + ancestors)
// ─────────────────────────────────────────────────────────────
async function buildTagDto(tag) {
    const ancestors = tag.parentId ? await getAncestors(tag.id) : [];
    return {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        category: tag.category,
        scope: tag.scope,
        parentId: tag.parentId ?? null,
        parentName: tag.parent?.name ?? ancestors[ancestors.length - 1]?.name ?? null,
        ancestors,   // [{id, name, color, scope}, ...] from root to immediate parent
        workspaceId: tag.workspaceId ?? null,
        createdById: tag.createdById ?? null,
        orgId: tag.orgId,
        usageCount: tag._count?.assetTags ?? 0,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
    };
}

// ─────────────────────────────────────────────────────────────
// GET /tags  — list tags for the org
// Query: scope, workspaceId, parentId, search, rootOnly
// ─────────────────────────────────────────────────────────────
module.exports.listTags = async (request, reply) => {
    try {
        const { orgId, id: userId } = request.user;
        const { scope, workspaceId, parentId, search, rootOnly } = request.query;

        const where = { orgId };

        if (scope) where.scope = scope;
        if (workspaceId) where.workspaceId = workspaceId;
        if (search) where.name = { contains: search, mode: 'insensitive' };

        // parentId=null → root tags only; parentId=<id> → children of that tag
        if (rootOnly === 'true') {
            where.parentId = null;
        } else if (parentId !== undefined) {
            where.parentId = parentId === 'null' ? null : parentId;
        }

        // Personal tags: only show the requesting user's own personal tags
        if (scope === 'personal') {
            where.createdById = userId;
        } else if (!scope) {
            // Without scope filter: show company/project tags + this user's personal tags
            where.OR = [
                { scope: { in: ['company', 'project'] } },
                { scope: 'personal', createdById: userId },
            ];
        }

        const tags = await prisma.tag.findMany({
            where,
            include: {
                parent: { select: { id: true, name: true } },
                _count: { select: { assetTags: true } },
            },
            orderBy: [{ scope: 'asc' }, { name: 'asc' }],
        });

        const data = await Promise.all(tags.map(buildTagDto));

        return reply.code(200).send({ success: true, data });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// POST /tags  — create a tag
// ─────────────────────────────────────────────────────────────
module.exports.createTag = async (request, reply) => {
    try {
        const { orgId, id: userId } = request.user;
        const { name, color, category, scope = 'company', workspaceId, parentId } = request.body;

        // — Validation —
        if (!name || !name.trim()) {
            return reply.code(400).send({ success: false, message: 'Tag name is required.' });
        }
        if (name.trim().length > 50) {
            return reply.code(400).send({ success: false, message: 'Tag name must be 50 characters or fewer.' });
        }
        if (!VALID_SCOPES.includes(scope)) {
            return reply.code(400).send({ success: false, message: `scope must be one of: ${VALID_SCOPES.join(', ')}.` });
        }
        if (scope === 'project' && !workspaceId) {
            return reply.code(400).send({ success: false, message: 'workspaceId is required when scope is "project".' });
        }

        // — Parent validation —
        if (parentId) {
            const parent = await prisma.tag.findFirst({ where: { id: parentId, orgId } });
            if (!parent) {
                return reply.code(400).send({ success: false, message: 'Parent tag not found in your organisation.' });
            }

            const safe = await assertNoCycle('NEW_TAG', parentId);  // no cycle possible for a new tag
            if (!safe) {
                return reply.code(400).send({ success: false, message: 'This parent would create a circular tag hierarchy.' });
            }

            // Check depth: the new tag's depth = parent depth + 1
            const parentDepth = await getDepth(parentId);
            if (parentDepth + 1 > MAX_TAG_DEPTH) {
                return reply.code(400).send({ success: false, message: `Tag hierarchy cannot exceed ${MAX_TAG_DEPTH} levels deep.` });
            }
        }

        const createdById = scope === 'personal' ? userId : null;

        const tag = await prisma.tag.create({
            data: {
                orgId,
                name: name.trim(),
                color: color ?? null,
                category: category ?? null,
                scope,
                workspaceId: scope === 'project' ? workspaceId : null,
                createdById,
                parentId: parentId ?? null,
            },
            include: {
                parent: { select: { id: true, name: true } },
                _count: { select: { assetTags: true } },
            },
        });

        const dto = await buildTagDto(tag);
        logSuccess(ACTIVITY_NAME?.TAG_CREATED ?? 'TAG_CREATED', `Tag "${tag.name}" created.`, request);

        return reply.code(201).send({ success: true, data: dto });
    } catch (error) {
        if (error.code === 'P2002') {
            return reply.code(409).send({ success: false, message: 'A tag with this name already exists under the same parent.' });
        }
        console.error(error);
        logError(ACTIVITY_NAME?.TAG_CREATED ?? 'TAG_CREATED', 'Failed to create tag.', request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /tags/:id  — get a single tag with ancestors
// ─────────────────────────────────────────────────────────────
module.exports.getTag = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const { id } = request.params;

        const tag = await prisma.tag.findFirst({
            where: { id, orgId },
            include: {
                parent: { select: { id: true, name: true } },
                children: { select: { id: true, name: true, color: true, scope: true } },
                _count: { select: { assetTags: true } },
            },
        });

        if (!tag) {
            return reply.code(404).send({ success: false, message: 'Tag not found.' });
        }

        const dto = await buildTagDto(tag);
        dto.children = tag.children;  // include direct children list too

        return reply.code(200).send({ success: true, data: dto });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /tags/:id/ancestors  — get ancestor chain for UI breadcrumb
// ─────────────────────────────────────────────────────────────
module.exports.getTagAncestors = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const { id } = request.params;

        const tag = await prisma.tag.findFirst({ where: { id, orgId } });
        if (!tag) {
            return reply.code(404).send({ success: false, message: 'Tag not found.' });
        }

        const ancestors = await getAncestors(id);
        return reply.code(200).send({ success: true, data: ancestors });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /tags/:id  — update a tag
// ─────────────────────────────────────────────────────────────
module.exports.updateTag = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const { id } = request.params;
        const { name, color, category, parentId } = request.body;

        const existing = await prisma.tag.findFirst({ where: { id, orgId } });
        if (!existing) {
            return reply.code(404).send({ success: false, message: 'Tag not found.' });
        }

        // — Name validation —
        if (name !== undefined) {
            if (!name.trim()) return reply.code(400).send({ success: false, message: 'Tag name cannot be empty.' });
            if (name.trim().length > 50) return reply.code(400).send({ success: false, message: 'Tag name must be 50 characters or fewer.' });
        }

        // — Parent change validation —
        const newParentId = parentId !== undefined ? (parentId === null ? null : parentId) : existing.parentId;

        if (newParentId && newParentId !== existing.parentId) {
            const parent = await prisma.tag.findFirst({ where: { id: newParentId, orgId } });
            if (!parent) {
                return reply.code(400).send({ success: false, message: 'Parent tag not found in your organisation.' });
            }

            const safe = await assertNoCycle(id, newParentId);
            if (!safe) {
                return reply.code(400).send({ success: false, message: 'This parent would create a circular tag hierarchy.' });
            }

            const parentDepth = await getDepth(newParentId);
            if (parentDepth + 1 > MAX_TAG_DEPTH) {
                return reply.code(400).send({ success: false, message: `Tag hierarchy cannot exceed ${MAX_TAG_DEPTH} levels deep.` });
            }
        }

        const updated = await prisma.tag.update({
            where: { id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(color !== undefined && { color }),
                ...(category !== undefined && { category }),
                ...(parentId !== undefined && { parentId: newParentId }),
            },
            include: {
                parent: { select: { id: true, name: true } },
                _count: { select: { assetTags: true } },
            },
        });

        const dto = await buildTagDto(updated);
        logSuccess(ACTIVITY_NAME?.TAG_UPDATED ?? 'TAG_UPDATED', `Tag "${updated.name}" updated.`, request);

        return reply.code(200).send({ success: true, data: dto });
    } catch (error) {
        if (error.code === 'P2002') {
            return reply.code(409).send({ success: false, message: 'A tag with this name already exists under the same parent.' });
        }
        console.error(error);
        logError(ACTIVITY_NAME?.TAG_UPDATED ?? 'TAG_UPDATED', 'Failed to update tag.', request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /tags/:id  — delete a tag
// Query: strategy = 'block' (default) | 'reparent'
//   block   → reject if the tag has children
//   reparent → move children up to deleted tag's parent before deleting
// ─────────────────────────────────────────────────────────────
module.exports.deleteTag = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const { id } = request.params;
        const { strategy = 'block' } = request.query;

        const tag = await prisma.tag.findFirst({
            where: { id, orgId },
            include: { _count: { select: { children: true } } },
        });

        if (!tag) {
            return reply.code(404).send({ success: false, message: 'Tag not found.' });
        }

        if (tag._count.children > 0) {
            if (strategy === 'block') {
                return reply.code(409).send({
                    success: false,
                    message: `This tag has ${tag._count.children} child tag(s). Delete or reparent them first, or use strategy=reparent.`,
                });
            } else if (strategy === 'reparent') {
                // Move all children to deleted tag's parent (or to root if no parent)
                await prisma.tag.updateMany({
                    where: { parentId: id },
                    data: { parentId: tag.parentId ?? null },
                });
            }
        }

        // Detach AssetTag and ProjectTag rows (FK cascade handles this, but explicit for clarity)
        await prisma.tag.delete({ where: { id } });

        logSuccess(ACTIVITY_NAME?.TAG_DELETED ?? 'TAG_DELETED', `Tag "${tag.name}" deleted.`, request);
        return reply.code(200).send({ success: true, message: `Tag "${tag.name}" deleted successfully.` });
    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME?.TAG_DELETED ?? 'TAG_DELETED', 'Failed to delete tag.', request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /projects/:projectId/default-tags  — list project default tags
// ─────────────────────────────────────────────────────────────
module.exports.getProjectDefaultTags = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const { projectId } = request.params;

        // Verify the project belongs to this org via its workspace
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { workspace: { orgId } },
                    { folder: { workspace: { orgId } } },
                ],
            },
        });

        if (!project) {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }

        const projectTags = await prisma.projectTag.findMany({
            where: { projectId },
            include: {
                tag: {
                    include: {
                        parent: { select: { id: true, name: true } },
                        _count: { select: { assetTags: true } },
                    },
                },
                addedBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { addedAt: 'asc' },
        });

        const data = await Promise.all(projectTags.map(async (pt) => ({
            ...(await buildTagDto(pt.tag)),
            addedAt: pt.addedAt,
            addedBy: pt.addedBy,
        })));

        return reply.code(200).send({ success: true, data });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// PUT /projects/:projectId/default-tags  — set project default tags
// Body: { tagIds: string[] }
// Replaces the full default tag set for the project.
// ─────────────────────────────────────────────────────────────
module.exports.setProjectDefaultTags = async (request, reply) => {
    try {
        const { orgId, id: userId } = request.user;
        const { projectId } = request.params;
        const { tagIds = [] } = request.body;

        // Verify project belongs to this org
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { workspace: { orgId } },
                    { folder: { workspace: { orgId } } },
                ],
            },
        });

        if (!project) {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }

        // Verify all tagIds exist in this org
        if (tagIds.length > 0) {
            const foundTags = await prisma.tag.findMany({
                where: { id: { in: tagIds }, orgId },
                select: { id: true },
            });
            if (foundTags.length !== tagIds.length) {
                return reply.code(400).send({ success: false, message: 'One or more tag IDs are invalid or do not belong to your organisation.' });
            }
        }

        // Replace: delete existing, insert new
        await prisma.$transaction([
            prisma.projectTag.deleteMany({ where: { projectId } }),
            ...(tagIds.length > 0
                ? [prisma.projectTag.createMany({
                    data: tagIds.map((tagId) => ({ projectId, tagId, addedById: userId })),
                    skipDuplicates: true,
                })]
                : []),
        ]);

        logSuccess(
            ACTIVITY_NAME?.PROJECT_TAGS_UPDATED ?? 'PROJECT_TAGS_UPDATED',
            `Default tags updated for project ${projectId}.`,
            request
        );

        return reply.code(200).send({ success: true, message: 'Project default tags updated successfully.' });
    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME?.PROJECT_TAGS_UPDATED ?? 'PROJECT_TAGS_UPDATED', 'Failed to update project default tags.', request, error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};
