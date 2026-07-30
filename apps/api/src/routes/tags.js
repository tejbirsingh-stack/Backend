const {
    listTags,
    createTag,
    getTag,
    getTagAncestors,
    updateTag,
    deleteTag,
    getProjectDefaultTags,
    setProjectDefaultTags,
} = require('../controller');
const { authenticate } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
    fastify.addHook('preHandler', authenticate);

    // ── Tag CRUD ──────────────────────────────────────────────
    // GET    /api/tags                     list tags (filters: scope, workspaceId, search, rootOnly)
    // POST   /api/tags                     create tag
    // GET    /api/tags/:id                 get single tag (with children + ancestors)
    // GET    /api/tags/:id/ancestors       get ancestor breadcrumb chain
    // PATCH  /api/tags/:id                 update tag (name, color, parentId)
    // DELETE /api/tags/:id                 delete tag (?strategy=block|reparent)
    fastify.get('/', listTags);
    fastify.post('/', createTag);
    fastify.get('/:id', getTag);
    fastify.get('/:id/ancestors', getTagAncestors);
    fastify.patch('/:id', updateTag);
    fastify.delete('/:id', deleteTag);

    // ── Project default tags ──────────────────────────────────
    // GET  /api/tags/projects/:projectId/default-tags    list defaults
    // PUT  /api/tags/projects/:projectId/default-tags    replace defaults
    fastify.get('/projects/:projectId/default-tags', getProjectDefaultTags);
    fastify.put('/projects/:projectId/default-tags', setProjectDefaultTags);

    done();
};
