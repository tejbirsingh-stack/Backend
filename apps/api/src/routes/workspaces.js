const { storeWorkplace, findAllWorkspaces, createFolder, findWorkspaceMedia, createProject, findFolderData, linkProjectSource } = require('../controller');
const { authenticate } = require('../middleware/auth-middleware')

module.exports = async function (fastify) {

    fastify.addHook("preHandler", authenticate);

    fastify.post('/add', storeWorkplace);
    fastify.get('/find-all', findAllWorkspaces);
    fastify.get('/find-all-data/:id', findWorkspaceMedia);
    fastify.post('/folder/add/:workspaceId', createFolder);
    fastify.get('/folder/find-all-data/:id', findFolderData);
    fastify.post('/project/add/:workspaceId', createProject);
    fastify.post('/project/link-source/:projectId', linkProjectSource);

    // fastify.get('/folder/find-all', findAllFolders);
    // fastify.get('/folder/find-by-id/:id', findFolderById);
    // fastify.put('/folder/update/:id', updateFolder);
    // fastify.delete('/folder/delete/:id', deleteFolder);

};