const {
  getMediaAnnotations,
  saveMediaAnnotations,
  updateMediaAnnotations,
  deleteMediaAnnotations,
  getAnnotationGroups,
  createAnnotationGroup,
  deleteAnnotationGroup,
  updateAnnotationGroup,
  markAnnotationRead,
} = require('../controller');
const { authenticate, requirePermission } = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {
  const canAnnotate = { preValidation: [authenticate, requirePermission('timeline_annotations')] };
  const canPrivacy = { preValidation: [authenticate, requirePermission('annotation_privacy')] };

  // 1. Get All annotations for specific media asset
  fastify.get("/media/:mediaId", canAnnotate, getMediaAnnotations);

  // 2. Create a new annotation
  fastify.post("/media/:mediaId", canAnnotate, saveMediaAnnotations);

  // 3. Update an existing annotation
  fastify.put("/:id", canAnnotate, updateMediaAnnotations);

  // 4. Delete an annotation
  fastify.delete("/:id", canAnnotate, deleteMediaAnnotations);

  // 5. Mark annotation as read / unread
  fastify.post("/:id/read", canAnnotate, markAnnotationRead);

  // 6. Get all groups for a media asset
  fastify.get("/media/:mediaId/groups", canAnnotate, getAnnotationGroups);

  // 7. Create a group for a media asset
  fastify.post("/media/:mediaId/groups", canPrivacy, createAnnotationGroup);

  // 8. Delete a group
  fastify.delete("/media/:mediaId/groups/:groupId", canPrivacy, deleteAnnotationGroup);

  // 9. Update a group
  fastify.put("/media/:mediaId/groups/:groupId", canPrivacy, updateAnnotationGroup);

  done();
};