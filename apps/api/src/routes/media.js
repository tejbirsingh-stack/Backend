/**
 * @swagger
 * tags:
 *   name: Media Assets
 *   description: Media asset management endpoints
 */

const { dir } = require("console");
const { request, get } = require("http");

/**
 * @swagger
 * /media:
 *   get:
 *     summary: Get all media assets
 *     description: Retrieve a list of all media assets with optional filtering and sorting
 *     tags: [Media Assets]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query string
 *         example: brand campaign
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [All, Video, Images, Audio, Document]
 *         description: Filter by media type
 *         example: Video
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, name, type, size]
 *         description: Field to sort by
 *         example: date
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *         example: desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results
 *         example: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of results to skip
 *         example: 0
 *     responses:
 *       200:
 *         description: List of media assets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MediaAsset'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     hasMore:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 *   post:
 *     summary: Upload new media assets
 *     description: Upload one or more media files
 *     tags: [Media Assets]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Files uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Files uploaded successfully
 *                 uploaded:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MediaAsset'
 *       400:
 *         description: Bad request - invalid file type or size
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /media/{id}:
 *   get:
 *     summary: Get a specific media asset
 *     description: Retrieve details of a specific media asset by ID
 *     tags: [Media Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Media asset ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Media asset details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaAsset'
 *       404:
 *         description: Media asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 *   delete:
 *     summary: Delete a media asset
 *     description: Permanently delete a media asset
 *     tags: [Media Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Media asset ID
 *         example: 1
 *     responses:
 *       204:
 *         description: Media asset deleted successfully
 *       404:
 *         description: Media asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

const { 
  getMediaAssets, 
  searchMediaAssets, 
  fileStreamPreview, 
  downloadFile, 
  softDelete, 
  restoreSoftDelete, 
  deletePermanently, 
  getMediaFile, 
  updateAssetTags,
  uploadMediaFile, 
  deleteMediaFile,
  requestPermanentDelete,
  adminApproveDelete,
  rejectDelete,
  getPendingDeletions,
  initiateResumableUpload,
  uploadChunk,
  getChunkUploadUrl,
  getUploadStatus,
  completeResumableUpload,
  abortResumableUpload,
  handleCoconutWebhook,
  getThumbnail,
  retryTranscode,
  getAssetAccessOverrides,
  updateAssetAccessOverride,
  removeAssetAccessOverride,
  getSharedMediaAssets
  // checkDuplicateMediaFile
} = require('../controller');

module.exports = function (fastify, opts, done) {

  // Register parser for raw binary upload chunks
  fastify.addContentTypeParser('application/octet-stream', (req, payload, done) => {
    done(null, payload);
  });

  // Early Duplicate Check Endpoint (Disabled per request)
  // fastify.post("/upload/check-duplicate", { preHandler: [fastify.authenticate] }, checkDuplicateMediaFile);

  //2. Get media assets - return real uploaded files
  fastify.get("/getmediaassets", { preValidation: [fastify.authenticate]} , getMediaAssets);

  //3. Search media assets
  fastify.get("/search", { preValidation: [fastify.authenticate] },searchMediaAssets);

  //4. Stream file for preview/playback (video player uses this URL)
  fastify.get("/:filename/stream",fileStreamPreview);

  // 4b. Stream thumbnail image directly by asset ID
  fastify.get("/:id/thumbnail", getThumbnail);

  //5. Download file (browser saves to disk)
  fastify.get("/:filename/download", downloadFile);

  //6. List soft-deleted files (Trash)
  fastify.get("/trash", { preValidation: [fastify.authenticate] }, softDelete);

  //7. Restore a soft-deleted file
  fastify.post("/:filename/restore", { preValidation: [fastify.authenticate] }, restoreSoftDelete);

  //8. Permanently delete a file from B2
  fastify.delete("/:filename/permanent",deletePermanently);

  //9. GET /api/media/:filename — file bytes for players
  fastify.get("/:filename", getMediaFile);

  //9.1 POST and PATCH /api/media/:filename/tags — update asset tags
  fastify.post("/:filename/tags", { preValidation: [fastify.authenticate] }, updateAssetTags);
  fastify.patch("/:filename/tags", { preValidation: [fastify.authenticate] }, updateAssetTags);

  //10. Upload media asset
  fastify.post("/upload", { preHandler: [fastify.authenticate] }, uploadMediaFile);

  //11. Delete media asset
  fastify.delete("/:filename", { preValidation: [fastify.authenticate] }, deleteMediaFile);

  //11.1 Request Permanent Delete
  fastify.post("/:filename/request-delete", { preValidation: [fastify.authenticate] }, requestPermanentDelete);

  //11.2 Admin Approve Delete
  fastify.post("/:filename/admin-approve", { preValidation: [fastify.authenticate] }, adminApproveDelete);

  //11.3 Reject Delete
  fastify.post("/:filename/reject", { preValidation: [fastify.authenticate] }, rejectDelete);

  //11.4 Retry Transcode
  fastify.post("/:id/retry-transcode", { preValidation: [fastify.authenticate] }, retryTranscode);
  
  fastify.get("/pending-deletions", { preValidation: [fastify.authenticate] }, getPendingDeletions);

  //11.5 Asset Direct Access Role Overrides
  fastify.get("/shared-with-me", { preValidation: [fastify.authenticate] }, getSharedMediaAssets);
  fastify.get("/:id/access", { preValidation: [fastify.authenticate] }, getAssetAccessOverrides);
  fastify.patch("/:id/access/:userId", { preValidation: [fastify.authenticate] }, updateAssetAccessOverride);
  fastify.delete("/:id/access/:userId", { preValidation: [fastify.authenticate] }, removeAssetAccessOverride);

  //12. Initialize a Resumable Multipart Upload Session
  fastify.post("/upload/init", { preHandler: [fastify.authenticate] }, initiateResumableUpload);

  //13.  Upload an individual raw binary chunk
  fastify.put("/upload/chunk", { preHandler: [fastify.authenticate] }, uploadChunk);

  //13b. Get Presigned URL for chunk upload
  fastify.get("/upload/chunk-url", { preHandler: [fastify.authenticate] }, getChunkUploadUrl);

  //14. Check which chunks have been successfully uploaded
  fastify.get("/upload/status/:sessionId", { preHandler: [fastify.authenticate] }, getUploadStatus);

  //15. Complete Multipart Upload Session and Create Database Record
  fastify.post("/upload/complete", { preHandler: [fastify.authenticate] }, completeResumableUpload);

  //16. Abort Multipart Upload Session
  fastify.delete("/upload/abort/:sessionId", { preHandler: [fastify.authenticate] }, abortResumableUpload);

  //17. Coconut Webhook
  fastify.post("/webhooks/coconut", handleCoconutWebhook);

  done();
};
