const { createShareLink, listAssetShareLinks, revokeShareLink, getPublicShareLink, getPublicShareAssetMedia } = require('../controller');
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  // Public endpoints (no auth required)
  fastify.get('/public/share-links/:token', getPublicShareLink);
  fastify.get('/public/share-links/:token/media', getPublicShareAssetMedia);

  // Protected endpoints (owner / admin / editor with create_share_links permission)
  const canShare = { preValidation: [authenticate, requirePermission('create_share_links')] };
  fastify.post('/media/:id/share-links', canShare, createShareLink);
  fastify.get('/media/:id/share-links', canShare, listAssetShareLinks);
  fastify.delete('/share-links/:id', canShare, revokeShareLink);

  done();
};
