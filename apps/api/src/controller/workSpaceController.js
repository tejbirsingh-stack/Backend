const prisma = require('../utils/prisma');
const { logSuccess, ACTIVITY_NAME, logError } = require('../lib/audit-log');
const { getAncestors } = require('../services/tagHierarchy');
module.exports.storeWorkplace = async (request, reply) => {
    try {
        const { name, description, color } = request.body;
        const { orgId } = request.user;

        if (!orgId || !name) {
            return reply.code(400).send({
                success: false,
                message: 'Organization ID and Name are required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Workspace name cannot exceed 100 characters.'
            });
        }

        if (description && description.length > 500) {
            return reply.code(400).send({
                success: false,
                message: 'Workspace description cannot exceed 500 characters.'
            });
        }

        const existing = await prisma.workspace.findFirst({
            where: {
                orgId,
                name
            }
        });
        if (existing)
            return reply.code(409).send({
                success: false,
                message: "Name already exist",
                data: null
            });

        const workspace = await prisma.workspace.create({
            data: {
                orgId,
                name,
                description,
                color
            }
        });
        logSuccess(ACTIVITY_NAME.WORKSPACE_CREATED, "Workspace created successfully.", request);
        return reply.code(201).send({
            success: true,
            message: 'Workspace created successfully.',
            data: workspace
        });

    } catch (error) {
        console.error(error);
        logError(ACTIVITY_NAME.WORKSPACE_CREATED, `Failed to create workspace, Error : ${error?.message}`, request, error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findAllWorkspaces = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const workspaces = await prisma.workspace.findMany({
            where: {
                orgId
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
        const { tagIds } = request.query || {};

        let tagsArray = [];
        if (tagIds) {
            tagsArray = Array.isArray(tagIds) ? tagIds : tagIds.split(',');
        }

        let folders = [];
        let allProjects = [];

        const allWorkspaceFolders = await prisma.folder.findMany({
            where: { workspaceId: id },
            select: { id: true }
        });
        const folderIds = allWorkspaceFolders.map(f => f.id);

        if (tagsArray.length === 0) {
            folders = await prisma.folder.findMany({
                where: {
                    workspaceId: id,
                },
                include: {
                    sources: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            allProjects = await prisma.project.findMany({
                where: {
                    OR: [
                        { workspaceId: id },
                        { folderId: { in: folderIds } }
                    ]
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
        }

        const projects = allProjects;

        return reply.code(200).send({
            success: true,
            message: 'Workspace contents fetched successfully.',
            data: {
                media: [], // Deprecated: Media items are now fetched via the paginated library API
                folders,
                projects,
                allProjects,
                working: {}
            }
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
        const { workspaceId, ownerType } = request.params; // workspace (for now) & Project later 
        const { name, parentId, color, linkedProjectId } = request.body;
        const { orgId, id: userId } = request.user;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name is required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name cannot exceed 100 characters.'
            });
        }

        // Validate parent folder exists (if provided)
        if (parentId) {
            const parentFolder = await prisma.folder.findUnique({
                where: {
                    id: parentId,
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
                color,
                parentId,
                workspaceId,
                ...(linkedProjectId ? {
                    sources: {
                        create: {
                            projectId: linkedProjectId,
                            sourceableType: 'FOLDER'
                        }
                    }
                } : {})
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

module.exports.createProject = async (request, reply) => {
    try {
        const { workspaceId } = request.params;
        const { name, folderId, defaultTagIds } = request.body;
        const { orgId, id: userId } = request.user;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Project name is required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Project name cannot exceed 100 characters.'
            });
        }

        let finalFolderId = folderId;
        let finalOwnerType = folderId ? 'FOLDER' : 'WORKSPACE';
        let resolvedFolderName = null;

        if (!folderId) {
            // Determine year and month folders
            const tzSetting = await prisma.systemTimezone.findFirst({
                where: { type: 'workspace', enabled: true }
            });
            const timeZone = tzSetting ? tzSetting.timezone : 'Europe/London';

            const now = new Date();
            const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(now);
            const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone }).format(now);

            // 1. Find or create Year folder
            let yearFolder = await prisma.folder.findFirst({
                where: { workspaceId, name: year, parentId: null }
            });

            if (!yearFolder) {
                yearFolder = await prisma.folder.create({
                    data: { name: year, workspaceId, parentId: null }
                });
            }

            // 2. Find or create Month folder
            let monthFolder = await prisma.folder.findFirst({
                where: { workspaceId, name: month, parentId: yearFolder.id }
            });

            if (!monthFolder) {
                monthFolder = await prisma.folder.create({
                    data: { name: month, workspaceId, parentId: yearFolder.id }
                });
            }

            finalFolderId = monthFolder.id;
            finalOwnerType = 'FOLDER';
            resolvedFolderName = monthFolder.name;
        }

        const project = await prisma.project.create({
            data: {
                name,
                ownerType: finalOwnerType,
                workspaceId,
                folderId: finalFolderId || null,
            },
        });

        const tagIds = Array.isArray(defaultTagIds) ? defaultTagIds : [];
        if (tagIds.length > 0) {
            // Validate all tags belong to this org
            const validTags = await prisma.tag.findMany({
                where: { id: { in: tagIds }, orgId },
                select: { id: true },
            });
            const validTagIds = validTags.map(t => t.id);

            if (validTagIds.length > 0) {
                await prisma.projectTag.createMany({
                    data: validTagIds.map(tagId => ({
                        projectId: project.id,
                        tagId,
                        addedById: userId,
                    })),
                    skipDuplicates: true,
                });
            }
        }

        return reply.code(201).send({
            success: true,
            message: 'Project created successfully.',
            data: project,
            folderId: finalFolderId,
            folderName: resolvedFolderName
        });

    } catch (error) {
        console.error(error);

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};
module.exports.findAllProjects = async (request, reply) => {
    try {
        const { orgId } = request.user;
        const projects = await prisma.project.findMany({
            where: {
                workspace: {
                    orgId
                }
            },
            include: {
                workspace: {
                    select: { name: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return reply.code(200).send({
            success: true,
            data: projects
        });
    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findFolderData = async (request, reply) => {
    try {
        const { id } = request.params; // folderId


        const folders = await prisma.folder.findMany({
            where: {
                parentId: id,
            },
            include: {
                sources: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const projects = await prisma.project.findMany({
            where: {
                ownerType: 'FOLDER',
                folderId: id,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const folderInfo = await prisma.folder.findUnique({
            where: { id },
            include: { sources: true }
        });

        return reply.code(200).send({
            success: true,
            message: 'Folder contents fetched successfully.',
            data: {
                folderInfo,
                media: [], // Deprecated: fetched via pagination API
                folders,
                projects
            }
        });

    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.findProjectData = async (request, reply) => {
    try {
        const { projectId } = request.params;

        const projectSources = await prisma.projectSource.findMany({
            where: {
                projectId: projectId
            },
            include: {
                asset: {
                    include: {
                        files: true,
                        metadata: true
                    }
                },
                folder: true
            }
        });

        const projectAssets = []; // Deprecated: fetched via pagination API
        const projectFolders = projectSources.filter(ps => ps.sourceableType === 'FOLDER' && ps.folder).map(ps => ps.folder);

        return reply.code(200).send({
            success: true,
            message: 'Project contents fetched successfully.',
            data: {
                media: projectAssets,
                folders: projectFolders
            }
        });

    } catch (error) {
        console.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.linkProjectSource = async (request, reply) => {
    try {
        const { projectId } = request.params;
        const { sourceableType, assetId, folderId } = request.body;

        if (!sourceableType || !['ASSET', 'FOLDER'].includes(sourceableType)) {
            return reply.code(400).send({
                success: false,
                message: 'Valid sourceableType (ASSET or FOLDER) is required.'
            });
        }

        if (sourceableType === 'ASSET' && !assetId) {
            return reply.code(400).send({
                success: false,
                message: 'assetId is required when sourceableType is ASSET.'
            });
        }

        if (sourceableType === 'FOLDER' && !folderId) {
            return reply.code(400).send({
                success: false,
                message: 'folderId is required when sourceableType is FOLDER.'
            });
        }

        let oldExpandedTagIdsToRemove = new Set();

        if (sourceableType === 'ASSET' && assetId) {
            const oldSources = await prisma.projectSource.findMany({
                where: {
                    sourceableType: 'ASSET',
                    assetId: assetId
                }
            });
            const oldProjectIds = oldSources.map(s => s.projectId);

            if (oldProjectIds.length > 0) {
                const oldProjectTags = await prisma.projectTag.findMany({
                    where: { projectId: { in: oldProjectIds } },
                    select: { tagId: true }
                });

                for (const pt of oldProjectTags) {
                    oldExpandedTagIdsToRemove.add(pt.tagId);
                    try {
                        const ancestors = await getAncestors(pt.tagId);
                        for (const ancestor of ancestors) {
                            oldExpandedTagIdsToRemove.add(ancestor.id);
                        }
                    } catch (err) {
                        console.warn(`[AssetTag] Failed to fetch ancestors for tag ${pt.tagId}:`, err.message);
                    }
                }
            }

            if (oldExpandedTagIdsToRemove.size > 0) {
                await prisma.assetTag.deleteMany({
                    where: {
                        assetId: assetId,
                        tagId: { in: Array.from(oldExpandedTagIdsToRemove) }
                    }
                });
            }

            await prisma.projectSource.deleteMany({
                where: {
                    sourceableType: 'ASSET',
                    assetId: assetId
                }
            });
        }

        if (sourceableType === 'FOLDER' && folderId) {
            await prisma.projectSource.deleteMany({
                where: {
                    sourceableType: 'FOLDER',
                    folderId: folderId
                }
            });
        }

        const projectSource = await prisma.projectSource.create({
            data: {
                projectId,
                sourceableType,
                assetId: sourceableType === 'ASSET' ? assetId : null,
                folderId: sourceableType === 'FOLDER' ? folderId : null,
            }
        });

        // Apply project default tags automatically to the newly linked asset
        if (sourceableType === 'ASSET' && assetId) {
            try {
                // Fetch project default tags
                const projectTags = await prisma.projectTag.findMany({
                    where: { projectId },
                    select: { tagId: true }
                });

                if (projectTags.length > 0) {
                    const expandedTagIds = new Set();

                    for (const pt of projectTags) {
                        expandedTagIds.add(pt.tagId);
                        try {
                            const ancestors = await getAncestors(pt.tagId);
                            for (const ancestor of ancestors) {
                                expandedTagIds.add(ancestor.id);
                            }
                        } catch (err) {
                            console.warn(`[AssetTag] Failed to fetch ancestors for tag ${pt.tagId}:`, err.message);
                        }
                    }

                    for (const targetTagId of expandedTagIds) {
                        await prisma.assetTag.upsert({
                            where: {
                                assetId_tagId: {
                                    assetId,
                                    tagId: targetTagId
                                }
                            },
                            update: {},
                            create: {
                                assetId,
                                tagId: targetTagId,
                                addedById: request.user.id
                            }
                        });
                    }
                }
            } catch (tagErr) {
                console.warn(`[AssetTag] Could not assign default tags when linking asset ${assetId} to project ${projectId}:`, tagErr.message);
            }
        }

        return reply.code(201).send({
            success: true,
            message: 'Source linked to project successfully.',
            data: projectSource
        });

    } catch (error) {
        console.error(error);

        // Handle unique constraint violation (P2002) for duplicate links
        if (error.code === 'P2002') {
            return reply.code(409).send({
                success: false,
                message: 'This source is already linked to the project.'
            });
        }

        return reply.code(500).send({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports.updateFolder = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name } = request.body;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name is required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Folder name cannot exceed 100 characters.'
            });
        }

        const folder = await prisma.folder.update({
            where: { id },
            data: { name }
        });

        return reply.send({
            success: true,
            message: 'Folder renamed successfully.',
            data: folder
        });
    } catch (error) {
        console.error(error);
        if (error.code === 'P2025') {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.moveFolder = async (request, reply) => {
    try {
        const { id } = request.params;
        const { targetFolderId, targetWorkspaceId } = request.body;

        if (!targetFolderId && !targetWorkspaceId) {
            return reply.code(400).send({
                success: false,
                message: 'Either targetFolderId or targetWorkspaceId must be provided.'
            });
        }

        const folder = await prisma.folder.findFirst({
            where: { id }
        });

        if (!folder) {
            return reply.code(404).send({ success: false, message: 'Folder not found.' });
        }

        let newWorkspaceId = targetWorkspaceId || folder.workspaceId;
        let newParentId = targetFolderId || null;

        if (targetFolderId) {
            const targetFolder = await prisma.folder.findFirst({
                where: { id: targetFolderId }
            });
            if (!targetFolder) {
                return reply.code(404).send({ success: false, message: 'Target folder not found.' });
            }
            newWorkspaceId = targetFolder.workspaceId;
        } else if (targetWorkspaceId) {
            const workspace = await prisma.workspace.findFirst({
                where: { id: targetWorkspaceId }
            });
            if (!workspace) {
                return reply.code(404).send({ success: false, message: 'Target workspace not found.' });
            }
        }

        // Prevent moving folder into itself
        if (id === targetFolderId) {
            return reply.code(400).send({ success: false, message: 'Cannot move folder into itself.' });
        }

        const updatedFolder = await prisma.folder.update({
            where: { id },
            data: {
                parentId: newParentId,
                workspaceId: newWorkspaceId
            }
        });

        // Recursively update workspaceId for all descendant folders if the workspace changed
        if (folder.workspaceId !== newWorkspaceId) {
            // 1. Gather all folder IDs involved in the move
            const movingFolderIds = [id];
            const getDescendantIds = async (parentId) => {
                const children = await prisma.folder.findMany({ where: { parentId }, select: { id: true } });
                for (const child of children) {
                    movingFolderIds.push(child.id);
                    await getDescendantIds(child.id);
                }
            };
            await getDescendantIds(id);

            // 2. Identify all projects inside the moving folders
            const movingProjects = await prisma.project.findMany({
                where: { folderId: { in: movingFolderIds } },
                select: { id: true }
            });
            const movingProjectIds = movingProjects.map(p => p.id);

            // 3. Find all assets inside these moving folders
            const movingAssets = await prisma.asset.findMany({
                where: { ownerType: 'FOLDER', ownerId: { in: movingFolderIds } },
                select: { id: true }
            });
            const movingAssetIds = movingAssets.map(a => a.id);

            // 4. Update folders, projects, and assets to the new workspaceId
            await prisma.folder.updateMany({
                where: { id: { in: movingFolderIds } },
                data: { workspaceId: newWorkspaceId }
            });

            if (movingProjectIds.length > 0) {
                await prisma.project.updateMany({
                    where: { id: { in: movingProjectIds } },
                    data: { workspaceId: newWorkspaceId }
                });
            }

            // Update workspaceId on all assets physically inside the moving folders
            if (movingAssetIds.length > 0) {
                await prisma.asset.updateMany({
                    where: { id: { in: movingAssetIds } },
                    data: { workspaceId: newWorkspaceId }
                });
            }

            // 5. Unlink moving folders from any outside projects
            await prisma.projectSource.deleteMany({
                where: {
                    sourceableType: 'FOLDER',
                    folderId: { in: movingFolderIds },
                    projectId: { notIn: movingProjectIds } // keep links for projects inside the moving folder
                }
            });

            // 6. Unlink moving assets from any outside projects
            if (movingAssetIds.length > 0) {
                await prisma.projectSource.deleteMany({
                    where: {
                        sourceableType: 'ASSET',
                        assetId: { in: movingAssetIds },
                        projectId: { notIn: movingProjectIds } // keep links for projects inside the moving folder
                    }
                });

                // 7. Remove project-scoped tags from moving assets (since they changed workspace)
                const projectTagsToWipe = await prisma.tag.findMany({
                    where: { scope: 'project' },
                    select: { id: true }
                });
                const projectTagIds = projectTagsToWipe.map(t => t.id);

                if (projectTagIds.length > 0) {
                    await prisma.assetTag.deleteMany({
                        where: {
                            assetId: { in: movingAssetIds },
                            tagId: { in: projectTagIds }
                        }
                    });
                }
            }

            // 8. Handle moving projects: unlink outside assets/folders and clear inherited tags
            if (movingProjectIds.length > 0) {
                // a. Find all default tags of these moving projects
                const projectTags = await prisma.projectTag.findMany({
                    where: { projectId: { in: movingProjectIds } },
                    select: { tagId: true }
                });
                
                // b. Expand to include ancestors
                let expandedTagIdsToRemove = new Set();
                for (const pt of projectTags) {
                    expandedTagIdsToRemove.add(pt.tagId);
                    try {
                        const ancestors = await getAncestors(pt.tagId);
                        for (const ancestor of ancestors) {
                            expandedTagIdsToRemove.add(ancestor.id);
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch ancestors for tag ${pt.tagId}:`, err.message);
                    }
                }
                
                const tagsToRemoveArray = Array.from(expandedTagIdsToRemove);

                // Filter to ONLY project-scoped tags (preserve company/personal tags)
                const projectTagsToWipe = await prisma.tag.findMany({
                    where: {
                        id: { in: tagsToRemoveArray },
                        scope: 'project'
                    },
                    select: { id: true }
                });
                const projectTagsToWipeIds = projectTagsToWipe.map(t => t.id);

                // c. Find the outside assets linked to moving projects
                const outsideProjectSources = await prisma.projectSource.findMany({
                    where: {
                        projectId: { in: movingProjectIds },
                        sourceableType: 'ASSET',
                        assetId: { notIn: movingAssetIds }
                    },
                    select: { assetId: true }
                });
                const outsideAssetIds = outsideProjectSources.map(s => s.assetId).filter(Boolean);

                // d. Remove ONLY project-scoped inherited tags from the outside assets
                if (outsideAssetIds.length > 0 && projectTagsToWipeIds.length > 0) {
                    await prisma.assetTag.deleteMany({
                        where: {
                            assetId: { in: outsideAssetIds },
                            tagId: { in: projectTagsToWipeIds }
                        }
                    });
                }

                // e. Unlink outside assets from the moving projects
                await prisma.projectSource.deleteMany({
                    where: {
                        projectId: { in: movingProjectIds },
                        sourceableType: 'ASSET',
                        assetId: { notIn: movingAssetIds }
                    }
                });

                // f. Unlink outside folders from the moving projects
                await prisma.projectSource.deleteMany({
                    where: {
                        projectId: { in: movingProjectIds },
                        sourceableType: 'FOLDER',
                        folderId: { notIn: movingFolderIds }
                    }
                });

                // g. Wipe default tags from the moving projects themselves
                // Since they are moving to a new workspace, their old workspace tags are invalid
                await prisma.projectTag.deleteMany({
                    where: {
                        projectId: { in: movingProjectIds }
                    }
                });
            }
        }

        return reply.code(200).send({
            success: true,
            message: 'Folder moved successfully.',
            data: updatedFolder
        });
    } catch (error) {
        console.error('Failed to move folder:', error);
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.updateProject = async (request, reply) => {
    try {
        const { id } = request.params;
        const { name } = request.body;

        if (!name) {
            return reply.code(400).send({
                success: false,
                message: 'Project name is required.'
            });
        }

        if (name.length > 100) {
            return reply.code(400).send({
                success: false,
                message: 'Project name cannot exceed 100 characters.'
            });
        }

        const project = await prisma.project.update({
            where: { id },
            data: { name }
        });

        return reply.send({
            success: true,
            message: 'Project renamed successfully.',
            data: project
        });
    } catch (error) {
        console.error(error);
        if (error.code === 'P2025') {
            return reply.code(404).send({ success: false, message: 'Project not found.' });
        }
        return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
};

module.exports.findTimezone = async (request, reply) => {
    try {
        const tzSetting = await request.server.prisma.systemTimezone.findFirst({
            where: { type: 'workspace', enabled: true }
        });
        const timeZone = tzSetting ? tzSetting.timezone : 'Europe/London';

        return reply.code(200).send({
            success: true,
            timezone: timeZone
        });
    } catch (error) {
        request.server.log.error(error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to fetch timezone',
            timezone: 'Europe/London'
        });
    }
};