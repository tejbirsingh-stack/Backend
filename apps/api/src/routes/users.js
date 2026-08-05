const { getUsers, getSingleUser, createUser, userAcitivites, getRoles } = require("../controller");
const { authenticate } = require("../middleware/auth-middleware");

module.exports = function (fastify, opts, done) {
  // 1. Get all users belonging to authenticated user's organization
  fastify.get("/", { preHandler: authenticate }, getUsers);

  // 2. Get single user
  fastify.get("/:id", getSingleUser);

  // 3. Update single user (Super Admin)
  fastify.put("/:id", { preHandler: authenticate }, require('../controller/userController').updateUserAdmin);

  // 4. Create user
  fastify.post("/", createUser);

  fastify.get('/user-activities', { preHandler: authenticate }, userAcitivites);

  fastify.get('/roles', { preHandler: authenticate }, getRoles);

  // Avatar serving (publicly accessible, or maybe auth-protected but <img> tags usually don't send auth headers easily unless it's cookie-based)
  fastify.get('/:id/avatar', require('../controller/userController').getAvatar);

  // Profile management
  fastify.put('/profile', { preHandler: authenticate }, require('../controller/userController').updateProfile);
  fastify.post('/profile/photo', { preHandler: authenticate }, require('../controller/userController').uploadProfilePhoto);

  // 5. Bulk update users (Super Admin only)
  fastify.post('/bulk', { preHandler: authenticate }, require('../controller/userController').bulkUpdateUsersAdmin);

  done();
};