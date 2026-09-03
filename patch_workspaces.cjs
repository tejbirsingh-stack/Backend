const fs = require('fs');
const path = require('path');

const controllerPath = path.join(__dirname, 'apps/api/src/controller/workSpaceController.js');
const routesPath = path.join(__dirname, 'apps/api/src/routes/workspaces.js');

let controllerCode = fs.readFileSync(controllerPath, 'utf8');

const newEndpoints = `
module.exports.removeWorkspaceMember = async (request, reply) => {
    try {
        const { id: workspaceId, memberId } = request.params;
        const hasAccess = await assertWorkspaceAccess(prisma, request.user, workspaceId);
        if (!hasAccess) {
            return reply.code(403).send({ success: false, message: 'Forbidden' });
        }

        // Prevent removing Owner
        const member = await prisma.workspaceUser.findFirst({
            where: {
                workspaceId,
                OR: [{ id: memberId }, { userId: memberId }]
            }
        });

        if (member && member.memberType === 'OWNER') {
            return reply.code(403).send({ success: false, message: 'Cannot remove the owner of the workspace.' });
        }

        await prisma.workspaceUser.deleteMany({
            where: {
                workspaceId,
                OR: [
                    { id: memberId },
                    { userId: memberId }
                ]
            }
        });

        await prisma.workspaceGroup.deleteMany({
            where: {
                workspaceId,
                OR: [
                    { id: memberId },
                    { groupId: memberId }
                ]
            }
        });

        return reply.send({
            success: true,
            message: 'Workspace access removed successfully.'
        });
    } catch (error) {
        console.error('Error removing workspace member:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to remove workspace member.'
        });
    }
};

module.exports.addWorkspaceMember = async (request, reply) => {
    try {
        const { id: workspaceId } = request.params;
        const { email, memberType, accessLevel = 'Full Access', groupId, sendInviteEmail = false } = request.body;

        const hasAccess = await assertWorkspaceAccess(prisma, request.user, workspaceId);
        if (!hasAccess) {
            return reply.code(403).send({ success: false, message: 'Forbidden' });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { organization: true }
        });

        if (!workspace) {
            return reply.code(404).send({ success: false, message: 'Workspace not found.' });
        }

        const inviterName = request.user?.name || request.user?.email || 'A team member';
        const orgId = request.user?.orgId;
        const appUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");

        if (groupId) {
            const group = await prisma.userGroup.findUnique({
                where: { id: groupId },
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, email: true, orgId: true } }
                        }
                    }
                }
            });
            if (!group) {
                return reply.code(404).send({ success: false, message: 'Group not found.' });
            }
            let resolvedAccessLevelId = null;
            if (accessLevel) {
                const lvl = await prisma.accessLevel.findFirst({ where: { OR: [{ title: accessLevel }, { id: accessLevel }] } });
                if (lvl) resolvedAccessLevelId = lvl.id;
            }
            await prisma.workspaceGroup.upsert({
                where: { workspaceId_groupId: { workspaceId, groupId: group.id } },
                update: { accessLevelId: resolvedAccessLevelId || accessLevel },
                create: {
                    workspaceId,
                    groupId: group.id,
                    accessLevelId: resolvedAccessLevelId || accessLevel,
                }
            }).catch(() => { });

            return reply.send({ success: true, message: 'Group added to workspace.' });
        }

        if (!email) {
            return reply.code(400).send({ success: false, message: 'Email or group is required.' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

        if (!user) {
            return reply.code(404).send({ success: false, message: 'User not found.' });
        }

        const effectiveMemberType = memberType || 'MEMBER';

        let resolvedAccessLevelId = null;
        if (accessLevel) {
            const lvl = await prisma.accessLevel.findFirst({ where: { OR: [{ title: accessLevel }, { id: accessLevel }] } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        } else {
            const lvl = await prisma.accessLevel.findFirst({ where: { name: 'FULL_ACCESS' } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        }

        await prisma.workspaceUser.upsert({
            where: { workspaceId_userId: { workspaceId, userId: user.id } },
            update: {
                accessLevelId: resolvedAccessLevelId || accessLevel,
                memberType: effectiveMemberType
            },
            create: {
                workspaceId,
                userId: user.id,
                accessLevelId: resolvedAccessLevelId || accessLevel,
                memberType: effectiveMemberType,
            }
        }).catch((err) => { console.error("Failed to add workspace member:", err) });

        return reply.send({
            success: true,
            message: \`\${effectiveMemberType} added to workspace successfully.\`
        });
    } catch (error) {
        console.error('Error adding workspace member:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to add workspace member.'
        });
    }
};

module.exports.updateWorkspaceMemberAccess = async (request, reply) => {
    try {
        const { id: workspaceId, memberId } = request.params;
        const { accessLevel } = request.body;

        const hasAccess = await assertWorkspaceAccess(prisma, request.user, workspaceId);
        if (!hasAccess) {
            return reply.code(403).send({ success: false, message: 'Forbidden' });
        }

        let resolvedAccessLevelId = null;
        if (accessLevel) {
            const lvl = await prisma.accessLevel.findFirst({ where: { OR: [{ title: accessLevel }, { id: accessLevel }] } });
            if (lvl) resolvedAccessLevelId = lvl.id;
        }

        await prisma.workspaceUser.updateMany({
            where: {
                workspaceId,
                OR: [{ id: memberId }, { userId: memberId }]
            },
            data: { accessLevelId: resolvedAccessLevelId || accessLevel }
        });

        await prisma.workspaceGroup.updateMany({
            where: {
                workspaceId,
                OR: [{ id: memberId }, { groupId: memberId }]
            },
            data: { accessLevelId: resolvedAccessLevelId || accessLevel }
        });

        return reply.send({
            success: true,
            message: 'Workspace access updated successfully.'
        });
    } catch (error) {
        console.error('Error updating workspace member access:', error);
        return reply.code(500).send({
            success: false,
            message: 'Failed to update workspace member access.'
        });
    }
};
`;

if (!controllerCode.includes('addWorkspaceMember')) {
    fs.appendFileSync(controllerPath, newEndpoints);
    console.log('Appended endpoints to workSpaceController.js');
}

let routesCode = fs.readFileSync(routesPath, 'utf8');

const controllerImportsRegex = /const\s*{\s*([\s\S]+?)\s*}\s*=\s*require\('\.\.\/controller\/workSpaceController\.js'\);/;
const match = routesCode.match(controllerImportsRegex);

if (match) {
    let imports = match[1];
    if (!imports.includes('addWorkspaceMember')) {
        imports += ', addWorkspaceMember, updateWorkspaceMemberAccess, removeWorkspaceMember';
        routesCode = routesCode.replace(controllerImportsRegex, `const { ${imports} } = require('../controller/workSpaceController.js');`);
    }
}

if (!routesCode.includes('/:id/member')) {
    const routeInsert = `
  fastify.post('/:id/member', canManageWorkspaces, addWorkspaceMember);
  fastify.put('/:id/member/:memberId', canManageWorkspaces, updateWorkspaceMemberAccess);
  fastify.delete('/:id/member/:memberId', canManageWorkspaces, removeWorkspaceMember);
`;
    routesCode = routesCode.replace(/fastify\.post\('\/add',\s*canManageWorkspaces,\s*storeWorkplace\);/, `fastify.post('/add', canManageWorkspaces, storeWorkplace);\n${routeInsert}`);
    fs.writeFileSync(routesPath, routesCode);
    console.log('Updated routes in workspaces.js');
}

