const {
  getMediaAssets,
  searchMediaAssets,
  fileStreamPreview,
  getThumbnail,
  downloadFile,
  softDelete,
  restoreSoftDelete,
  deletePermanently,
  getMediaFile,
  updateAssetTags,
  uploadMediaFile,
  deleteMediaFile,
  initiateResumableUpload,
  uploadChunk,
  getChunkUploadUrl,
  getUploadStatus,
  completeResumableUpload,
  abortResumableUpload,
  retryTranscode,
  updateAssetReviewStatus,
  handleCoconutWebhook,
  requestPermanentDelete,
  adminApproveDelete,
  rejectDelete,
  getPendingDeletions,
  getAssetAccessOverrides,
  updateAssetAccessOverride,
  removeAssetAccessOverride,
  updateAssetGroupAccessOverride,
  removeAssetGroupAccessOverride,
  getSharedMediaAssets,
  moveMediaFile
} = require('../controller');

const {
  authenticate,
  requirePermission,
  requireProjectAccess,
} = require('../middleware/auth-middleware');

module.exports = function (fastify, opts, done) {

  // Register parser for raw binary upload chunks
  fastify.addContentTypeParser('application/octet-stream', (req, payload, done) => {
    done(null, payload);
  });

  const canView = { preValidation: [authenticate, requirePermission('view_search_media')] };
  const canStream = { preValidation: [authenticate, requirePermission('download_stream_media')] };
  const canUpload = { preHandler: [authenticate, requirePermission('upload_media'), requireProjectAccess()] };
  const canTrash = { preValidation: [authenticate, requirePermission('manage_trash')] };
  const canDelete = { preValidation: [authenticate, requirePermission('delete_media')] };
  const canTags = { preValidation: [authenticate, requirePermission('edit_metadata_tags')] };

  //2. Get media assets
  fastify.get("/getmediaassets", canView, getMediaAssets);

  //3. Search media assets
  fastify.get("/search", canView, searchMediaAssets);

  //4. Stream file for preview/playback
  fastify.get("/:filename/stream", fileStreamPreview);

  // 4b. Stream thumbnail image directly by asset ID
  fastify.get("/:id/thumbnail", getThumbnail);

  //5. Download file
  fastify.get("/:filename/download", downloadFile);

  //6. List soft-deleted files (Trash)
  fastify.get("/trash", canTrash, softDelete);

  //7. Restore a soft-deleted file
  fastify.post("/:filename/restore", canTrash, restoreSoftDelete);

  //8. Permanently delete a file from B2
  fastify.delete("/:filename/permanent", canDelete, deletePermanently);

  //9. GET /api/media/:filename — file bytes for players
  fastify.get("/:filename", getMediaFile);

  //9.1 POST and PATCH /api/media/:filename/tags — update asset tags
  fastify.post("/:filename/tags", canTags, updateAssetTags);
  fastify.patch("/:filename/tags", canTags, updateAssetTags);

  //9.1b PATCH /api/media/:id/review-status — update review workflow status
  fastify.patch("/:id/review-status", canTags, updateAssetReviewStatus);

  //9.2 PUT /api/media/:id/move - move asset to another folder/workspace
  fastify.put("/:id/move", canTags, moveMediaFile);

  //10. Upload media asset
  fastify.post("/upload", canUpload, uploadMediaFile);

  //11. Delete media asset
  fastify.delete("/:filename", canTrash, deleteMediaFile);

  //11.1 Request Permanent Delete
  fastify.post("/:filename/request-delete", canTrash, requestPermanentDelete);

  //11.2 Admin Approve Delete
  fastify.post("/:filename/admin-approve", canDelete, adminApproveDelete);

  //11.3 Reject Delete
  fastify.post("/:filename/reject", canTrash, rejectDelete);

  //11.4 Retry Transcode
  fastify.post("/:id/retry-transcode", canUpload, retryTranscode);
  
  fastify.get("/pending-deletions", canDelete, getPendingDeletions);

  //11.5 Asset Direct Access Role Overrides
  fastify.get("/shared-with-me", canView, getSharedMediaAssets);
  fastify.get("/:id/access", canView, getAssetAccessOverrides);
  fastify.patch("/:id/access/:userId", canTags, updateAssetAccessOverride);
  fastify.delete("/:id/access/:userId", canTags, removeAssetAccessOverride);

  //11.6 Asset Group Access Role Overrides
  fastify.put("/:id/group-access/:groupId", canTags, updateAssetGroupAccessOverride);
  fastify.delete("/:id/group-access/:groupId", canTags, removeAssetGroupAccessOverride);

  //12. Initialize a Resumable Multipart Upload Session
  fastify.post("/upload/init", canUpload, initiateResumableUpload);

  //13. Upload an individual raw binary chunk
  fastify.put("/upload/chunk", { preHandler: [authenticate, requirePermission('upload_media')] }, uploadChunk);

  //13b. Get Presigned URL for chunk upload
  fastify.get("/upload/chunk-url", { preHandler: [authenticate, requirePermission('upload_media')] }, getChunkUploadUrl);

  //14. Check which chunks have been successfully uploaded
  fastify.get("/upload/status/:sessionId", { preHandler: [authenticate, requirePermission('upload_media')] }, getUploadStatus);

  //15. Complete Multipart Upload Session and Create Database Record
  fastify.post("/upload/complete", canUpload, completeResumableUpload);

  //16. Abort Multipart Upload Session
  fastify.delete("/upload/abort/:sessionId", { preHandler: [authenticate, requirePermission('upload_media')] }, abortResumableUpload);

  //17. Coconut Webhook
  fastify.post("/webhooks/coconut", handleCoconutWebhook);

  done();
};
