const { getUsers, getSingleUser, createUser } = require("../controller");
const { authenticate } = require("../middleware/auth-middleware");

module.exports = function (fastify, opts, done) {
  // 1. Get all users belonging to authenticated user's organization
  fastify.get("/", { preHandler: authenticate }, getUsers);

  // 2. Get single user
  fastify.get("/:id", getSingleUser);

  // 3. Create user
  fastify.post("/", createUser);

  done();
};
