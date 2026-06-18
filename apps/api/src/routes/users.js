const { getUsers, getSingleUser, createUser } = require("../controller");

module.exports = function (fastify, opts, done) {
  // 1. Get all users
  fastify.get("/", getUsers);

  // 2. Get single user
  fastify.get("/:id", getSingleUser);

  // 3. Create user
  fastify.post("/", createUser);

  done();
};
