const {getMediaAnnotations,saveMediaAnnotations, updateMediaAnnotations, deleteMediaAnnotations} = require('../controller');

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

    done();
};