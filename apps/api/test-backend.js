const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) {
            console.log("No workspaces found");
            return;
        }
        const id = workspace.id;
        console.log("Testing with workspace ID:", id);
        
        // Let's run exactly what findWorkspaceMedia runs
        const mediaAssets = await prisma.asset.findMany({
            where: { ownerType: 'WORKSPACE', ownerId: id, deletedAt: null },
            include: { files: true, metadata: true, sources: true },
        });
        console.log("Assets:", mediaAssets.length);

        const folders = await prisma.folder.findMany({
            where: { workspaceId: id, parentId: null },
            include: { sources: true },
        });
        console.log("Folders:", folders.length);

        const projects = await prisma.project.findMany({
            where: { workspaceId: id, ownerType: 'WORKSPACE' },
        });
        console.log("Projects:", projects.length);

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
            }
        });
        console.log("AllProjects:", allProjects.length);
        console.log("SUCCESS");
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
