const {
  storeWorkplace,
  findAllWorkspaces,
  createFolder,
  findWorkspaceMedia,
  createProject,
  findFolderData,
  linkProjectSource,
  updateFolder,
  moveFolder,
  updateProject,
  findProjectData,
  findAllProjects,
  getProjectSources,
  deleteProject,
  restoreProject,
  removeProjectMember,
  addProjectMember,
  updateProjectMemberAccess,
  findTimezone,
  validateGuestUser,
  searchGuestUsers,
  findAccessLevels,
  deleteWorkspace,
  updateWorkspace,
  findFolderTreeData,
  deleteFolder,
  restoreFolder,
  addWorkspaceMember,
  updateWorkspaceMemberAccess,
  removeWorkspaceMember,
  searchWorkspaceMembers
} = require('../controller');
const { authenticate, requirePermission, requireSuperAdminOrAdmin } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  const canRead = { preHandler: [authenticate] };
  const canManageFolders = { preHandler: [authenticate, requirePermission('manage_root_folders')] };
  const canDeleteFolders = { preHandler: [authenticate, requireSuperAdminOrAdmin] };
  const canUpload = { preHandler: [authenticate, requirePermission('upload_media')] };

  const isSuperAdminUser = (req) => {
    const role = req.user?.role;
    const roleId = req.user?.roleId;
    const userRoleName = typeof role === 'string' ? role : '';
    return userRoleName === 'Super Admin' || roleId === '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15' || userRoleName.toLowerCase() === 'superadmin' || userRoleName.toLowerCase() === 'super_admin';
  };

  const canManageWorkspaces = {
    preHandler: [
      authenticate,
      async (request, reply) => {
        if (!isSuperAdminUser(request)) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Super Admin access required to manage workspaces',
          });
        }
      },
    ],
  };

  fastify.post('/add', canManageWorkspaces, storeWorkplace);

  fastify.get('/:id/member/search', canManageWorkspaces, searchWorkspaceMembers);
  fastify.post('/:id/member', canManageWorkspaces, addWorkspaceMember);
  fastify.put('/:id/member/:memberId', canManageWorkspaces, updateWorkspaceMemberAccess);
  fastify.delete('/:id/member/:memberId', canManageWorkspaces, removeWorkspaceMember);

  fastify.post('/update/:id', canManageWorkspaces, updateWorkspace);
  fastify.delete('/delete/:id', canManageWorkspaces, deleteWorkspace);
  fastify.delete('/:id', canManageWorkspaces, deleteWorkspace);
  const isSuperAdminOrAdminUser = (req) => {
    if (isSuperAdminUser(req)) return true;
    const role = req.user?.role || req.user?.roleRelation?.name;
    const roleId = req.user?.roleId;
    const userRoleName = typeof role === 'string' ? role.trim().toLowerCase() : '';
    return userRoleName === 'admin' || roleId === '88a6b2a1-b2f6-40d5-8b04-4abf7eb45401';
  };

  const findWorkspacesHandler = {
    preHandler: [
      authenticate,
      async (request, reply) => {
        if (request.query?.includeInactive === 'true' && !isSuperAdminOrAdminUser(request)) {
          return reply.status(403).send({
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions to view inactive workspaces',
            code: 'RBAC_DENIED',
          });
        }
      },
    ],
  };

  fastify.get('/find-all', findWorkspacesHandler, findAllWorkspaces);
  fastify.get('/find-all-data/:id', canRead, findWorkspaceMedia);
  fastify.post('/folder/add/:workspaceId', canManageFolders, createFolder);
  fastify.put('/folder/update/:id', canManageFolders, updateFolder);
  fastify.put('/folder/:id/move', canManageFolders, moveFolder);
  fastify.get('/folder/find-all-data/:id', canRead, findFolderData);
  fastify.get('/folder/find-all-tree/:id', canRead, findFolderTreeData);
  fastify.delete('/folder/delete/:id', canDeleteFolders, deleteFolder);
  fastify.post('/folder/delete/:id', canDeleteFolders, deleteFolder);
  fastify.post('/folder/restore/:id', canRead, restoreFolder);
  fastify.post('/project/add/:workspaceId', canUpload, createProject);
  fastify.put('/project/update/:id', canUpload, updateProject);
  fastify.delete('/project/delete/:id', canRead, deleteProject);
  fastify.post('/project/delete/:id', canRead, deleteProject);
  fastify.post('/project/restore/:id', canRead, restoreProject);
  fastify.post('/project/:projectId/member', canUpload, addProjectMember);
  fastify.put('/project/:projectId/member/:memberId', canUpload, updateProjectMemberAccess);
  fastify.delete('/project/:projectId/member/:memberId', canUpload, removeProjectMember);
  fastify.post('/project/link-source/:projectId', canUpload, linkProjectSource);
  fastify.get('/project/sources/:projectId', canRead, getProjectSources);
  fastify.get('/project/find-all-data/:projectId', canRead, findProjectData);
  fastify.get('/project/find-all', canRead, findAllProjects);
  fastify.get('/timezone', canRead, findTimezone);
  fastify.get('/validate-guest', canRead, validateGuestUser);
  fastify.get('/search-guests', canRead, searchGuestUsers);
  fastify.get('/access-levels', canRead, findAccessLevels);

  done();
};