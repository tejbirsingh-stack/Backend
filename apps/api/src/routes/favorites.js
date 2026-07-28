const { toggleFavorite, getFavorites } = require('../controller');
const { authenticate } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
    fastify.addHook("preHandler", authenticate);

    fastify.post('/toggle', toggleFavorite);
    fastify.get('/', getFavorites);

    done();
};
