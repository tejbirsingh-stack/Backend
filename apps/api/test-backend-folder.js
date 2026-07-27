const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const folderInfo = await prisma.folder.findFirst();
        if (!folderInfo) {
            console.log("No folder found");
            return;
        }
        const id = folderInfo.id;
        console.log("Testing with folder ID:", id);
        
        const mediaAssets = await prisma.asset.findMany({
            where: { ownerType: 'FOLDER', ownerId: id, deletedAt: null },
            include: { files: true, metadata: true, sources: true }
        });
        const folders = await prisma.folder.findMany({
            where: { parentId: id },
            include: { sources: true }
        });
        const projects = await prisma.project.findMany({
            where: { folderId: id, ownerType: 'FOLDER' }
        });
        const fetchedFolderInfo = await prisma.folder.findUnique({
            where: { id },
            include: { sources: true }
        });

        console.log("SUCCESS");
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
