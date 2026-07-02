// Collection Controller for folders
//1. Get collections 
module.exports.getCollections = async (request, reply) => {
    reply.send({ message: "Collections endpoints not yet implemented" });
};

//2. Get single collection
module.exports.getSingleCollection = async (request, reply) => {
    reply.send({ message: `Collection ${request.params.id} endpoint not yet implemented`});
};

//3. Create collection
module.exports.createCollection = async (request, reply) => {
    reply.send({ message: "Collection creation endpoint not yet implemented" });
};