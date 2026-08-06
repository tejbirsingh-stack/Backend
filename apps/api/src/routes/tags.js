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
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  const canReadTags = { preHandler: [authenticate, requirePermission('view_search_media')] };
  const canEditTags = { preHandler: [authenticate, requirePermission('edit_metadata_tags')] };

  fastify.get('/', canReadTags, listTags);
  fastify.post('/', canEditTags, createTag);
  fastify.get('/:id', canReadTags, getTag);
  fastify.get('/:id/ancestors', canReadTags, getTagAncestors);
  fastify.patch('/:id', canEditTags, updateTag);
  fastify.delete('/:id', canEditTags, deleteTag);

  fastify.get('/projects/:projectId/default-tags', canReadTags, getProjectDefaultTags);
  fastify.put('/projects/:projectId/default-tags', canEditTags, setProjectDefaultTags);

  done();
};
