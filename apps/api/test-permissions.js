const { PrismaClient } = require('@prisma/client');
const { resolveUserWorkspacePermissions } = require('./src/lib/rbac-policy');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findFirst({ where: { email: 'editor@yopmail.com' }, include: { roleRelation: true } });
  if (!user) {
    const allUsers = await prisma.user.findMany({ take: 5, include: { roleRelation: true } });
    console.log('No user found, available users:', allUsers.map(u => u.email + ' (' + u.roleRelation?.name + ')'));
    return;
  }
  
  const wu = await prisma.workspaceUser.findFirst({ where: { userId: user.id }, include: { workspace: true } });
  if (!wu) {
    console.log('User is not explicitly in any workspace_users');
    return;
  }
  console.log('WorkspaceUser record:', wu.workspace.name, 'AccessLevelID:', wu.accessLevelId);
  
  const mockUser = {
    id: user.id,
    role: user.roleRelation?.name,
    roleId: user.roleId,
    permissions: []
  };

  const perms = await resolveUserWorkspacePermissions(prisma, mockUser, wu.workspace);
  console.log('Effective Permissions:', perms);
  prisma.$disconnect();
}
run().catch(console.error);
