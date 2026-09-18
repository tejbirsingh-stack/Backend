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
  getPublicOrgLogo,
} = require('../controller/shareController');
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  // Owner endpoints: sharing is an Editor+ capability, not Viewer
  const canShare = { preValidation: [authenticate, requirePermission('create_share_links')] };

  fastify.post('/media/:id/share', canShare, createShareLink);
  fastify.get('/media/:id/share-links', canShare, getShareLinks);
  fastify.delete('/share-links/:id', canShare, deleteShareLink);
  fastify.post('/share-links/:id/resend', canShare, resendShareLinkInvite);
  fastify.patch('/share-links/:id', canShare, updateShareLink);

  // Public Guest endpoints (No org login required)
  fastify.get('/share/:token', validateShareToken);
  fastify.post('/share/:token/unlock', unlockShareToken);
  fastify.get('/share/:token/stream', getShareStream);
  fastify.get('/share/:token/annotations', getShareAnnotations);
  fastify.post('/share/:token/annotations', createShareAnnotation);
  fastify.get('/public/branding/logo/:orgId', getPublicOrgLogo);
  fastify.get('/share/logo/:orgId', getPublicOrgLogo);

  done();
};
