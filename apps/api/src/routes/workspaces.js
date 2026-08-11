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
  deleteProject,
  removeProjectMember,
  addProjectMember,
  updateProjectMemberAccess,
  findTimezone,
  searchGuestUsers,
} = require('../controller/workSpaceController');
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  const canRead = { preHandler: [authenticate] };
  const canManageFolders = { preHandler: [authenticate, requirePermission('manage_root_folders')] };
  const canUpload = { preHandler: [authenticate, requirePermission('upload_media')] };

  fastify.post('/add', canManageFolders, storeWorkplace);
  fastify.get('/find-all', canRead, findAllWorkspaces);
  fastify.get('/find-all-data/:id', canRead, findWorkspaceMedia);
  fastify.post('/folder/add/:workspaceId', canManageFolders, createFolder);
  fastify.put('/folder/update/:id', canManageFolders, updateFolder);
  fastify.put('/folder/:id/move', canManageFolders, moveFolder);
  fastify.get('/folder/find-all-data/:id', canRead, findFolderData);
  fastify.post('/project/add/:workspaceId', canUpload, createProject);
  fastify.put('/project/update/:id', canUpload, updateProject);
  fastify.delete('/project/delete/:id', canRead, deleteProject);
  fastify.post('/project/:projectId/member', canUpload, addProjectMember);
  fastify.put('/project/:projectId/member/:memberId', canUpload, updateProjectMemberAccess);
  fastify.delete('/project/:projectId/member/:memberId', canUpload, removeProjectMember);
  fastify.post('/project/link-source/:projectId', canUpload, linkProjectSource);
  fastify.get('/project/find-all-data/:projectId', canRead, findProjectData);
  fastify.get('/project/find-all', canRead, findAllProjects);
  fastify.get('/timezone', canRead, findTimezone);
  fastify.get('/search-guests', canRead, searchGuestUsers);

  done();
};