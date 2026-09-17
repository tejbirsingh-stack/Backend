const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_IDS,
  ROLE_PERMISSIONS_MAP,
  roleHasPermission,
} = require('../rbac-policy');
const {
  requirePermission,
  requireSuperAdminOrAdmin,
} = require('../../middleware/auth-middleware');

test('QA Viewer RBAC Fix Verification', async (t) => {
  await t.test('1. Verify Viewer has only view and stream permissions', () => {
    const viewerPerms = ROLE_PERMISSIONS_MAP[ROLE_IDS.VIEWER];
    assert.deepEqual(viewerPerms, ['view_search_media', 'download_stream_media']);

    // Streaming and viewing MUST be allowed
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'view_search_media'), true);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'download_stream_media'), true);

    // All QA-flagged actions MUST be forbidden for Viewer
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'upload_media'), false);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'manage_root_folders'), false);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'manage_users_permissions'), false);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'edit_metadata_tags'), false);
    assert.equal(roleHasPermission(ROLE_IDS.VIEWER, 'delete_media'), false);
  });

  await t.test('2. requirePermission middleware blocks unauthorized Viewer and allows authorized roles', async () => {
    const uploadGuard = requirePermission('upload_media');

    // Viewer attempting to upload -> must get 403
    let viewerStatusCode = null;
    let viewerResponseBody = null;
    const viewerReq = {
      user: {
        id: 'viewer-1',
        role: 'Viewer',
        roleId: ROLE_IDS.VIEWER,
        permissions: ['view_search_media', 'download_stream_media'],
      },
      params: {},
      body: {},
      query: {},
      server: { prisma: null },
    };
    const viewerReply = {
      status(code) {
        viewerStatusCode = code;
        return {
          send(body) {
            viewerResponseBody = body;
          },
        };
      },
    };

    await uploadGuard(viewerReq, viewerReply);
    assert.equal(viewerStatusCode, 403);
    assert.equal(viewerResponseBody.code, 'RBAC_DENIED');
    assert.equal(viewerResponseBody.requiredPermission, 'upload_media');

    // Editor attempting to upload -> must be allowed (status not set to 403)
    let editorStatusCode = null;
    const editorReq = {
      user: {
        id: 'editor-1',
        role: 'Editor',
        roleId: ROLE_IDS.EDITOR,
        permissions: ROLE_PERMISSIONS_MAP[ROLE_IDS.EDITOR],
      },
      params: {},
      body: {},
      query: {},
      server: { prisma: null },
    };
    const editorReply = {
      status(code) {
        editorStatusCode = code;
        return { send() {} };
      },
    };

    await uploadGuard(editorReq, editorReply);
    assert.equal(editorStatusCode, null); // passed through

    // Platform admin with '*' -> must be allowed
    let platformAdminStatusCode = null;
    const paReq = {
      user: {
        id: 'pa-1',
        role: 'PLATFORM_ADMIN',
        permissions: ['*'],
      },
      params: {},
      body: {},
      query: {},
      server: { prisma: null },
    };
    const paReply = {
      status(code) {
        platformAdminStatusCode = code;
        return { send() {} };
      },
    };

    await uploadGuard(paReq, paReply);
    assert.equal(platformAdminStatusCode, null); // passed through
  });

  await t.test('3. requireSuperAdminOrAdmin blocks Viewer from Organization mutation routes', async () => {
    let viewerStatus = null;
    let viewerBody = null;
    const viewerReq = {
      url: '/api/organizations/branding',
      user: {
        id: 'viewer-1',
        role: 'Viewer',
        roleId: ROLE_IDS.VIEWER,
      },
    };
    const viewerReply = {
      status(code) {
        viewerStatus = code;
        return {
          send(body) {
            viewerBody = body;
          },
        };
      },
    };

    await requireSuperAdminOrAdmin(viewerReq, viewerReply);
    assert.equal(viewerStatus, 403);
    assert.equal(viewerBody.code, 'RBAC_DENIED');

    // Admin should be allowed
    let adminStatus = null;
    const adminReq = {
      url: '/api/organizations/branding',
      user: {
        id: 'admin-1',
        role: 'Admin',
        roleId: ROLE_IDS.ADMIN,
      },
    };
    const adminReply = {
      status(code) {
        adminStatus = code;
        return { send() {} };
      },
    };

    await requireSuperAdminOrAdmin(adminReq, adminReply);
    assert.equal(adminStatus, null); // passed through
  });
});
