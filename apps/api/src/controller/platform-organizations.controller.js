const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');

function serializeOrg(org) {
  if (!org) return null;
  return {
    ...org,
    storageQuotaBytes: org.storageQuotaBytes?.toString?.() ?? String(org.storageQuotaBytes ?? 0),
    storageUsedBytes: org.storageUsedBytes?.toString?.() ?? String(org.storageUsedBytes ?? 0),
    currentPlan: org.currentPlan
      ? {
          ...org.currentPlan,
          storageQuotaBytes: org.currentPlan.storageQuotaBytes?.toString?.() ?? String(org.currentPlan.storageQuotaBytes ?? 0),
        }
      : null,
    _count: org._count,
  };
}

async function listOrganizations(request, reply) {
  try {
    const q = String(request.query?.q || '').trim();
    const status = request.query?.status ? String(request.query.status) : undefined;
    const planType = request.query?.planType ? String(request.query.planType) : undefined;
    const take = Math.min(parseInt(request.query?.limit || '50', 10) || 50, 200);
    const skip = parseInt(request.query?.offset || '0', 10) || 0;

    const where = {
      ...(status ? { status } : {}),
      ...(planType ? { planType } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          currentPlan: true,
          _count: { select: { users: true, workspaces: true, assets: true } },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return {
      success: true,
      total,
      organizations: items.map(serializeOrg),
    };
  } catch (error) {
    console.error('listOrganizations error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to list organizations',
      statusCode: 500,
    });
  }
}

async function getOrganization(request, reply) {
  try {
    const { orgId } = request.params;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        currentPlan: true,
        _count: { select: { users: true, workspaces: true, assets: true } },
        workspaces: {
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { folders: true, projects: true, users: true } },
            folders: {
              where: { parentId: null },
              take: 50,
              select: {
                id: true,
                name: true,
                createdAt: true,
                _count: { select: { children: true } },
              },
            },
          },
        },
        users: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            roleRelation: { select: { id: true, name: true } },
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!org) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Organization not found',
        statusCode: 404,
      });
    }

    return { success: true, organization: serializeOrg(org) };
  } catch (error) {
    console.error('getOrganization error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load organization',
      statusCode: 500,
    });
  }
}

async function patchOrganization(request, reply) {
  try {
    const { orgId } = request.params;
    const body = request.body || {};
    const data = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'status must be active or suspended',
          statusCode: 400,
        });
      }
      data.status = body.status;
    }
    if (body.planType !== undefined) data.planType = String(body.planType);
    if (body.maxUsers !== undefined) data.maxUsers = parseInt(body.maxUsers, 10);
    if (body.maxWorkspaces !== undefined) data.maxWorkspaces = parseInt(body.maxWorkspaces, 10);
    if (body.maxProjects !== undefined) data.maxProjects = parseInt(body.maxProjects, 10);
    if (body.storageQuotaBytes !== undefined) {
      data.storageQuotaBytes = BigInt(body.storageQuotaBytes);
    }
    if (body.currentPlanId !== undefined) {
      data.currentPlanId = body.currentPlanId || null;
      if (body.currentPlanId) {
        const plan = await prisma.plan.findUnique({ where: { id: body.currentPlanId } });
        if (!plan) {
          return reply.status(400).send({
            error: 'ValidationError',
            message: 'Plan not found',
            statusCode: 400,
          });
        }
        data.planType = plan.name.toLowerCase();
        data.storageQuotaBytes = plan.storageQuotaBytes;
        data.maxUsers = plan.maxUsers;
        data.maxWorkspaces = plan.maxWorkspaces;
        data.maxProjects = plan.maxProjects;
      }
    }
    if (body.subscriptionStatus !== undefined) {
      data.subscriptionStatus = body.subscriptionStatus;
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data,
      include: {
        currentPlan: true,
        _count: { select: { users: true, workspaces: true, assets: true } },
      },
    });

    await writePlatformAudit({
      activityName: 'Organization updated',
      description: `Updated org ${updated.name} (${updated.slug})`,
      activityType: 'organization',
      admin: request.platformAdmin,
      orgId: updated.id,
    });

    return { success: true, organization: serializeOrg(updated) };
  } catch (error) {
    console.error('patchOrganization error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update organization',
      statusCode: 500,
    });
  }
}

async function updateWorkspace(request, reply) {
  try {
    const { orgId, workspaceId } = request.params;
    const body = request.body || {};
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, orgId },
    });
    if (!workspace) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Workspace not found',
        statusCode: 404,
      });
    }

    const data = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = body.description;
    if (body.color !== undefined) data.color = body.color;

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data,
    });

    await writePlatformAudit({
      activityName: 'Workspace updated',
      description: `Updated workspace ${updated.name}`,
      activityType: 'workspace',
      admin: request.platformAdmin,
      orgId,
    });

    return { success: true, workspace: updated };
  } catch (error) {
    console.error('updateWorkspace error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update workspace',
      statusCode: 500,
    });
  }
}

module.exports = {
  listOrganizations,
  getOrganization,
  patchOrganization,
  updateWorkspace,
};
