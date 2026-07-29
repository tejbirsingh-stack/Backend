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
} = require('../controller/shareController');

module.exports = function (fastify, opts, done) {
  // Owner endpoints (JWT Auth required)
  fastify.post('/media/:id/share', { preValidation: [fastify.authenticate] }, createShareLink);
  fastify.get('/media/:id/share-links', { preValidation: [fastify.authenticate] }, getShareLinks);
  fastify.delete('/share-links/:id', { preValidation: [fastify.authenticate] }, deleteShareLink);
  fastify.post('/share-links/:id/resend', { preValidation: [fastify.authenticate] }, resendShareLinkInvite);

  // Public Guest endpoints (No org login required)
  fastify.get('/share/:token', validateShareToken);
  fastify.post('/share/:token/unlock', unlockShareToken);
  fastify.get('/share/:token/stream', getShareStream);
  fastify.get('/share/:token/annotations', getShareAnnotations);
  fastify.post('/share/:token/annotations', createShareAnnotation);

  done();
};
