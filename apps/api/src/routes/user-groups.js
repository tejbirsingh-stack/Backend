// User Groups Routes
const userGroupsController = require('../controller/userGroups.controller.js');
const { authenticate, checkRole } = require('../middleware/auth-middleware.js');

async function userGroupsRoutes(fastify, options) {
  // All user groups routes require authentication
  fastify.addHook('onRequest', authenticate);
  
  // Everyone can view groups to share with them
  fastify.get('/user-groups', userGroupsController.getUserGroups);
  
  // Only Admin and Super Admin can manage groups
  const adminHook = { preHandler: [checkRole(['Super Admin', 'Admin'])] };
  
  fastify.post('/user-groups', adminHook, userGroupsController.createUserGroup);
  fastify.put('/user-groups/:id', adminHook, userGroupsController.updateUserGroup);
  fastify.delete('/user-groups/:id', adminHook, userGroupsController.deleteUserGroup);
}

module.exports = userGroupsRoutes;
