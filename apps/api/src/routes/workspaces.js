const { storeWorkplace, findAllWorkspaces, createFolder, findWorkspaceMedia, createProject, findFolderData, linkProjectSource, updateFolder, moveFolder, updateProject, findProjectData, findAllProjects, findTimezone } = require('../controller');
const { authenticate } = require('../middleware/auth-middleware')

module.exports = function (fastify, opts, done) {

    fastify.addHook("preHandler", authenticate);

    fastify.post('/add', storeWorkplace);
    fastify.get('/find-all', findAllWorkspaces);
    fastify.get('/find-all-data/:id', findWorkspaceMedia);
    fastify.post('/folder/add/:workspaceId', createFolder);
    fastify.put('/folder/update/:id', updateFolder);
    fastify.put('/folder/:id/move', moveFolder);
    fastify.get('/folder/find-all-data/:id', findFolderData);
    fastify.post('/project/add/:workspaceId', createProject);
    fastify.put('/project/update/:id', updateProject);
    fastify.post('/project/link-source/:projectId', linkProjectSource);
    fastify.get('/project/find-all-data/:projectId', findProjectData);
    fastify.get('/project/find-all', findAllProjects);
    fastify.get('/timezone', findTimezone);

    // fastify.get('/folder/find-all', findAllFolders);
    // fastify.get('/folder/find-by-id/:id', findFolderById);
    // fastify.delete('/folder/delete/:id', deleteFolder);
    done();
};