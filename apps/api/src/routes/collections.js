const { getCollections, getSingleCollection, createCollection } = require ('../controller');

module.exports = function (fastify, opts, done) {
  //1. Get collections 
  fastify.get("/", getCollections);

  //2. Get single collection
  fastify.get("/:id", getSingleCollection);

  //3. Create collection
  fastify.post("/", createCollection);

  done();
};
