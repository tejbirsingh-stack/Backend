// Video Compression Controller

//1. Compression request
module.exports.compress = async (request, reply) => {
    reply.send({ message: "Compression request endpoint not yet implemented" });
}; 

//2. Compression status
module.exports.compressStatus = async (request, reply) => {
    reply.send({ message: `Compression status endpoint for ${request.params.id} not yet implemented` });
}