const { storeWorkplace, findAllWorkspaces, findWorkspaceMedia } = require('../controller');
const { authenticate } = require('../middleware/auth-middleware')

module.exports = async function (fastify) {

    fastify.addHook("preHandler", authenticate);

    fastify.post('/add', storeWorkplace);
    fastify.get('/find-all', findAllWorkspaces);
    // fastify.get('/find-workspace-media/:id', findWorkspaceMedia);
};