const test = require('node:test');
const assert = require('node:assert/strict');
const { findAllWorkspaces } = require('../../controller/workSpaceController');
const prisma = require('../../utils/prisma');

test('Workspace RBAC - findAllWorkspaces Access Controls', async (t) => {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalWorkspaceUserFindMany = prisma.workspaceUser.findMany;
  const originalWorkspaceFindMany = prisma.workspace.findMany;

  t.afterEach(() => {
    prisma.user.findUnique = originalUserFindUnique;
    prisma.workspaceUser.findMany = originalWorkspaceUserFindMany;
    prisma.workspace.findMany = originalWorkspaceFindMany;
  });

  await t.test('Viewer role requesting includeInactive=true is rejected with 403 Forbidden', async () => {
    prisma.user.findUnique = async () => ({
      id: 'viewer-user-1',
      role: 'Viewer',
      roleId: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
      roleRelation: { name: 'Viewer' }
    });

    let statusCode = null;
    let responseBody = null;

    const mockRequest = {
      user: {
        id: 'viewer-user-1',
        role: 'Viewer',
        roleId: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
        orgId: 'org-test-123'
      },
      query: {
        includeInactive: 'true'
      }
    };

    const mockReply = {
      code(c) {
        statusCode = c;
        return {
          send(b) {
            responseBody = b;
            return responseBody;
          }
        };
      }
    };

    await findAllWorkspaces(mockRequest, mockReply);

    assert.equal(statusCode, 403);
    assert.equal(responseBody.success, false);
    assert.equal(responseBody.error, 'Forbidden');
    assert.equal(responseBody.code, 'RBAC_DENIED');
  });

  await t.test('Viewer role requesting standard find-all only receives active workspaces and sanitized rosters', async () => {
    prisma.user.findUnique = async () => ({
      id: 'viewer-user-1',
      role: 'Viewer',
      roleId: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
      roleRelation: { name: 'Viewer' }
    });
    prisma.workspaceUser.findMany = async () => [];

    let capturedWhere = null;
    prisma.workspace.findMany = async (args) => {
      capturedWhere = args.where;
      return [
        {
          id: 'ws-1',
          name: 'Public Workspace',
          visibility: 'public',
          status: 'active',
          isDefault: true,
          createdAt: new Date()
        }
      ];
    };

    let statusCode = null;
    let responseBody = null;

    const mockRequest = {
      user: {
        id: 'viewer-user-1',
        role: 'Viewer',
        roleId: 'c3c36ad8-dc0a-464b-998b-a0847087fcd0',
        orgId: 'org-test-123'
      },
      query: {}
    };

    const mockReply = {
      code(c) {
        statusCode = c;
        return {
          send(b) {
            responseBody = b;
            return responseBody;
          }
        };
      }
    };

    await findAllWorkspaces(mockRequest, mockReply);

    assert.equal(statusCode, 200);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.length, 1);
    // Verified: Inactive/deleted/trash is filtered out
    assert.deepEqual(capturedWhere.status, { notIn: ['inactive', 'Inactive', 'deleted', 'trash'] });
    // Verified: Rosters are sanitized for non-admins
    assert.deepEqual(responseBody.data[0].users, []);
    assert.deepEqual(responseBody.data[0].groups, []);
  });

  await t.test('Super Admin role can successfully request includeInactive=true', async () => {
    prisma.user.findUnique = async () => ({
      id: 'admin-user-1',
      role: 'Super Admin',
      roleId: '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15',
      roleRelation: { name: 'Super Admin' }
    });
    prisma.workspaceUser.findMany = async () => [];

    let capturedWhere = null;
    let capturedInclude = null;
    prisma.workspace.findMany = async (args) => {
      capturedWhere = args.where;
      capturedInclude = args.include;
      return [
        {
          id: 'ws-inactive',
          name: 'Old Archived Workspace',
          visibility: 'public',
          status: 'inactive',
          isDefault: false,
          createdAt: new Date(),
          users: [{ user: { id: 'u1', name: 'Admin', email: 'admin@test.com' } }],
          groups: []
        }
      ];
    };

    let statusCode = null;
    let responseBody = null;

    const mockRequest = {
      user: {
        id: 'admin-user-1',
        role: 'Super Admin',
        roleId: '996cc58f-8823-4b6f-bcb9-76b2c1f2dd15',
        orgId: 'org-test-123'
      },
      query: {
        includeInactive: 'true'
      }
    };

    const mockReply = {
      code(c) {
        statusCode = c;
        return {
          send(b) {
            responseBody = b;
            return responseBody;
          }
        };
      }
    };

    await findAllWorkspaces(mockRequest, mockReply);

    assert.equal(statusCode, 200);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.length, 1);
    // Inactive filter is not applied when admin requests includeInactive
    assert.equal(capturedWhere.status, undefined);
    // Super Admin gets users and groups for workspace management
    assert.ok(capturedInclude.users);
    assert.ok(capturedInclude.groups);
  });
});
