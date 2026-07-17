const { storeWorkplace, findAllWorkspaces, createFolder } = require('../controller');
const { authenticate } = require('../middleware/auth-middleware')

module.exports = async function (fastify) {

    fastify.addHook("preHandler", authenticate);

    fastify.post('/add', storeWorkplace);
    fastify.get('/find-all', findAllWorkspaces);

    // Routes for Folder
    fastify.post('/folder/add', createFolder);
    // fastify.get('/folder/find-all', findAllFolders);
    // fastify.get('/folder/find-by-id/:id', findFolderById);
    // fastify.put('/folder/update/:id', updateFolder);
    // fastify.delete('/folder/delete/:id', deleteFolder);

};