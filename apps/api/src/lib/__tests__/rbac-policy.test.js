const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_IDS,
  PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
  roleHasPermission,
  isOrgWideRole,
} = require('../rbac-policy');

test('RBAC Policy Matrix Unit Tests', async (t) => {
  await t.test('Super Admin has all 16 permissions', () => {
    const superAdminPerms = ROLE_PERMISSIONS_MAP[ROLE_IDS.SUPER_ADMIN];
    assert.equal(superAdminPerms.length, 16);
    assert.equal(roleHasPermission(ROLE_IDS.SUPER_ADMIN, 'delete_media'), true);
  });

  await t.test('Editor has upload_media and manage_trash but NO delete_media', () => {
    assert.equal(roleHasPermission(ROLE_IDS.EDITOR, 'upload_media'), true);
    assert.equal(roleHasPermission(ROLE_IDS.EDITOR, 'manage_trash'), true);
    assert.equal(roleHasPermission(ROLE_IDS.EDITOR, 'delete_media'), false);
  });

  await t.test('Collaborator has stream & annotations but NO upload or delete', () => {
    assert.equal(roleHasPermission(ROLE_IDS.COLLABORATOR, 'download_stream_media'), true);
    assert.equal(roleHasPermission(ROLE_IDS.COLLABORATOR, 'timeline_annotations'), true);
    assert.equal(roleHasPermission(ROLE_IDS.COLLABORATOR, 'upload_media'), false);
    assert.equal(roleHasPermission(ROLE_IDS.COLLABORATOR, 'delete_media'), false);
  });

  await t.test('Viewer has view & stream only', () => {
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'view_search_media'), true);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'download_stream_media'), true);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'timeline_annotations'), false);
  });

  await t.test('Org-wide role detection', () => {
    assert.equal(isOrgWideRole('Super Admin'), true);
    assert.equal(isOrgWideRole('Admin'), true);
    assert.equal(isOrgWideRole('Editor'), false);
    assert.equal(isOrgWideRole('Collaborator'), false);
  });
});
