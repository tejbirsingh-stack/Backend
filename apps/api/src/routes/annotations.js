const {getMediaAnnotations,saveMediaAnnotations, updateMediaAnnotations, deleteMediaAnnotations, getAnnotationGroups, createAnnotationGroup, deleteAnnotationGroup, updateAnnotationGroup} = require('../controller');

module.exports = function (fastify, opts, done) {
    // All annotation endpoints require authentication
    fastify.addHook("preValidation", fastify.authenticate);

    // 1. Get All annotations for specific media asset (video)
    fastify.get("/media/:mediaId", getMediaAnnotations);

    // 2. Create a new annotation (Comment, drawing, shape, stamp)
    fastify.post("/media/:mediaId", saveMediaAnnotations);

    // 3. Update an existing annotation
    fastify.put("/:id", updateMediaAnnotations);

    // 4. Delete an annotation
    fastify.delete("/:id", deleteMediaAnnotations);

    // 5. Get all groups for a media asset
    fastify.get("/media/:mediaId/groups", getAnnotationGroups);

    // 6. Create a group for a media asset
    fastify.post("/media/:mediaId/groups", createAnnotationGroup);

    // 7. Delete a group
    fastify.delete("/media/:mediaId/groups/:groupId", deleteAnnotationGroup);

    // 8. Update a group
    fastify.put("/media/:mediaId/groups/:groupId", updateAnnotationGroup);

    done();
};