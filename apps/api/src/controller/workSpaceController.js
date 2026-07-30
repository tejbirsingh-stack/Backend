const prisma = require('../utils/prisma');
const { logSuccess, ACTIVITY_NAME, logError } = require('../lib/audit-log')
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

        const folders = await prisma.folder.findMany({
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

        const allWorkspaceFolders = await prisma.folder.findMany({
            where: { workspaceId: id },
            select: { id: true }
        });
        const folderIds = allWorkspaceFolders.map(f => f.id);

        const allProjects = await prisma.project.findMany({
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
        
        const projectIds = allProjects.map(p => p.id);

        const mediaAssets = await prisma.asset.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { ownerType: 'WORKSPACE', ownerId: id },
                    { ownerType: 'FOLDER', ownerId: { in: folderIds } }
                ]
            },
            include: {
                files: true,
                metadata: true,
                sources: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const projects = allProjects;

        return reply.code(200).send({
            success: true,
            message: 'Workspace contents fetched successfully.',
            data: {
                media: mediaAssets,
                folders,
                projects,
                allProjects
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
        const { name, folderId } = request.body;

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
        const mediaAssets = await prisma.asset.findMany({
            where: {
                ownerType: 'FOLDER',
                ownerId: id,
                deletedAt: null,
            },
            include: {
                files: true,
                metadata: true,
                sources: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

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
                media: mediaAssets,
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

        const projectAssets = projectSources.filter(ps => ps.sourceableType === 'ASSET' && ps.asset && ps.asset.deletedAt === null).map(ps => ps.asset);
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

        const projectSource = await prisma.projectSource.create({
            data: {
                projectId,
                sourceableType,
                assetId: sourceableType === 'ASSET' ? assetId : null,
                folderId: sourceableType === 'FOLDER' ? folderId : null,
            }
        });

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