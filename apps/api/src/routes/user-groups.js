const userGroupsController = require('../controller/userGroups.controller.js');
const { authenticate, requirePermission } = require('../middleware/auth-middleware.js');

async function userGroupsRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticate);

  const canManageUsers = { preHandler: [requirePermission('manage_users_permissions')] };

  // Everyone can view groups to share with them
  fastify.get('/user-groups', userGroupsController.getUserGroups);
  fastify.get('/user-groups/:id', userGroupsController.getUserGroup);

  // Manage groups requires manage_users_permissions
  fastify.post('/user-groups', canManageUsers, userGroupsController.createUserGroup);
  fastify.put('/user-groups/:id', canManageUsers, userGroupsController.updateUserGroup);
  fastify.delete('/user-groups/:id', canManageUsers, userGroupsController.deleteUserGroup);
  fastify.post('/user-groups/:id/members', canManageUsers, userGroupsController.addUserGroupMembers);
  fastify.delete('/user-groups/:id/members/:userId', canManageUsers, userGroupsController.removeUserGroupMember);
}

module.exports = userGroupsRoutes;
