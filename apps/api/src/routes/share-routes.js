//const { createShareLink, listAssetShareLinks, revokeShareLink, getPublicShareLink, getPublicShareAssetMedia } = require('../controller');
const {
  createShareLink,
  getShareLinks,
  deleteShareLink,
  resendShareLinkInvite,
  validateShareToken,
  unlockShareToken,
  getShareStream,
  getShareAnnotations,
  createShareAnnotation,
  updateShareLink,
} = require('../controller/shareController');

module.exports = function (fastify, opts, done) {
  // // Public endpoints (no auth required)
  // fastify.get('/public/share-links/:token', getPublicShareLink);
  // fastify.get('/public/share-links/:token/media', getPublicShareAssetMedia);

  // // Protected endpoints (owner / admin / editor with create_share_links permission)
  // const canShare = { preValidation: [authenticate, requirePermission('create_share_links')] };
  // fastify.post('/media/:id/share-links', canShare, createShareLink);
  // fastify.get('/media/:id/share-links', canShare, listAssetShareLinks);
  // fastify.delete('/share-links/:id', canShare, revokeShareLink);

  // done();

  // Owner endpoints (JWT Auth required)
  fastify.post('/media/:id/share', { preValidation: [fastify.authenticate] }, createShareLink);
  fastify.get('/media/:id/share-links', { preValidation: [fastify.authenticate] }, getShareLinks);
  fastify.delete('/share-links/:id', { preValidation: [fastify.authenticate] }, deleteShareLink);
  fastify.post('/share-links/:id/resend', { preValidation: [fastify.authenticate] }, resendShareLinkInvite);
  fastify.patch('/share-links/:id', { preValidation: [fastify.authenticate] }, updateShareLink);

  // Public Guest endpoints (No org login required)
  fastify.get('/share/:token', validateShareToken);
  fastify.post('/share/:token/unlock', unlockShareToken);
  fastify.get('/share/:token/stream', getShareStream);
  fastify.get('/share/:token/annotations', getShareAnnotations);
  fastify.post('/share/:token/annotations', createShareAnnotation);

  done();
};
