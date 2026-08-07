const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_IDS,
  PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
  roleHasPermission,
  isOrgWideRole,
} = require('../rbac-policy');
const { projectScopeWhere } = require('../rbac-access');

test('Comprehensive 5-Tier Role Simulation & Audit', async (t) => {
  await t.test('1. Super Admin Role Permissions & Access', () => {
    const roleId = ROLE_IDS.SUPER_ADMIN;
    assert.equal(isOrgWideRole(roleId), true);
    assert.equal(roleHasPermission(roleId, 'upload_media'), true);
    assert.equal(roleHasPermission(roleId, 'delete_media'), true);
    assert.equal(roleHasPermission(roleId, 'manage_subscription_billing'), true);

    const user = { roleId, orgId: 'org-123', allowedProjectIds: [] };
    const where = projectScopeWhere(user);
    assert.deepEqual(where, { orgId: 'org-123' });
  });

  await t.test('2. Admin Role Permissions & Access', () => {
    const roleId = ROLE_IDS.ADMIN;
    assert.equal(isOrgWideRole(roleId), true);
    assert.equal(roleHasPermission(roleId, 'upload_media'), true);
    assert.equal(roleHasPermission(roleId, 'delete_media'), true);
    assert.equal(roleHasPermission(roleId, 'manage_subscription_billing'), false);

    const user = { roleId, orgId: 'org-123', allowedProjectIds: [] };
    const where = projectScopeWhere(user);
    assert.deepEqual(where, { orgId: 'org-123' });
  });

  await t.test('3. Editor Role Permissions & Multi-Tenant Scoping', () => {
    const roleId = ROLE_IDS.EDITOR;
    assert.equal(isOrgWideRole(roleId), false);
    assert.equal(roleHasPermission(roleId, 'upload_media'), true);
    assert.equal(roleHasPermission(roleId, 'manage_trash'), true);
    assert.equal(roleHasPermission(roleId, 'delete_media'), false); // CANNOT HARD DELETE

    const user = { roleId, orgId: 'org-123', allowedProjectIds: ['proj-A', 'proj-B'] };
    const where = projectScopeWhere(user);
    assert.equal(where.orgId, 'org-123');
    assert.deepEqual(where.OR, [
      { ownerType: 'PROJECT', ownerId: { in: ['proj-A', 'proj-B'] } },
      { workspaceId: { in: ['proj-A', 'proj-B'] } },
    ]);
  });

  await t.test('4. Collaborator Role Permissions & Multi-Tenant Scoping', () => {
    const roleId = ROLE_IDS.COLLABORATOR;
    assert.equal(isOrgWideRole(roleId), false);
    assert.equal(roleHasPermission(roleId, 'download_stream_media'), true);
    assert.equal(roleHasPermission(roleId, 'timeline_annotations'), true);
    assert.equal(roleHasPermission(roleId, 'upload_media'), false);
    assert.equal(roleHasPermission(roleId, 'delete_media'), false);

    const user = { roleId, orgId: 'org-123', allowedProjectIds: ['proj-A'] };
    const where = projectScopeWhere(user);
    assert.equal(where.orgId, 'org-123');
    assert.deepEqual(where.OR, [
      { ownerType: 'PROJECT', ownerId: { in: ['proj-A'] } },
      { workspaceId: { in: ['proj-A'] } },
    ]);
  });

  await t.test('5. Viewer Role Permissions & Multi-Tenant Scoping', () => {
    const roleId = ROLE_IDS.VIEWER;
    assert.equal(isOrgWideRole(roleId), false);
    assert.equal(roleHasPermission(roleId, 'view_search_media'), true);
    assert.equal(roleHasPermission(roleId, 'download_stream_media'), true);
    assert.equal(roleHasPermission(roleId, 'timeline_annotations'), false);
    assert.equal(roleHasPermission(roleId, 'upload_media'), false);
    assert.equal(roleHasPermission(roleId, 'delete_media'), false);

    const user = { roleId, orgId: 'org-123', allowedProjectIds: ['proj-C'] };
    const where = projectScopeWhere(user);
    assert.equal(where.orgId, 'org-123');
    assert.deepEqual(where.OR, [
      { ownerType: 'PROJECT', ownerId: { in: ['proj-C'] } },
      { workspaceId: { in: ['proj-C'] } },
    ]);
  });
});
