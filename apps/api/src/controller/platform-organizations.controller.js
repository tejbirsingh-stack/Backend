const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');
const {
  slugify,
  formatWorkspaceName,
  ensureUniqueSlug,
  resolveSuperAdminRole,
  createDefaultWorkspace,
  ensureDefaultOrganizationSettings,
  sendUserInviteEmail,
  authService,
} = require('../lib/platform-provision');

function serializeOrg(org) {
  if (!org) return null;
  const currentPlan = org.currentPlan || {};
  return {
    ...org,
    planType: currentPlan.name ? currentPlan.name.toLowerCase() : (org.metadata?.planId || 'free'),
    storageQuotaBytes: (currentPlan.storageQuotaBytes || 0n).toString(),
    maxUsers: currentPlan.maxUsers ?? 5,
    maxWorkspaces: currentPlan.maxWorkspaces ?? 1,
    maxProjects: currentPlan.maxProjects ?? 1,
    features: currentPlan.features ?? [],
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
    const planId = request.query?.planId
      ? String(request.query.planId)
      : request.query?.planType
        ? String(request.query.planType)
        : undefined;
    const subscriptionStatus = request.query?.subscriptionStatus
      ? String(request.query.subscriptionStatus)
      : undefined;
    const minStorageBytes = request.query?.minStorageBytes ? String(request.query.minStorageBytes) : undefined;
    const maxStorageBytes = request.query?.maxStorageBytes ? String(request.query.maxStorageBytes) : undefined;
    const createdFrom = request.query?.createdFrom ? String(request.query.createdFrom) : undefined;
    const createdTo = request.query?.createdTo ? String(request.query.createdTo) : undefined;

    const take = Math.min(parseInt(request.query?.limit || '50', 10) || 50, 200);
    const skip = parseInt(request.query?.offset || '0', 10) || 0;
    const sortBy = request.query?.sortBy ? String(request.query.sortBy) : 'createdAt';
    const sortDir = request.query?.sortDir === 'asc' ? 'asc' : 'desc';

    const where = {
      ...(status ? { status } : {}),
      ...(planId
        ? planId === 'none'
          ? { currentPlanId: null }
          : {
            OR: [
              { currentPlanId: planId },
              { currentPlan: { name: { equals: planId, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(subscriptionStatus
        ? subscriptionStatus === 'none'
          ? { subscriptionStatus: null }
          : { subscriptionStatus }
        : {}),
      ...(minStorageBytes || maxStorageBytes
        ? {
          storageUsedBytes: {
            ...(minStorageBytes ? { gte: BigInt(minStorageBytes) } : {}),
            ...(maxStorageBytes ? { lte: BigInt(maxStorageBytes) } : {}),
          },
        }
        : {}),
      ...(createdFrom || createdTo
        ? {
          createdAt: {
            ...(createdFrom ? { gte: new Date(createdFrom) } : {}),
            ...(createdTo ? { lte: new Date(`${createdTo}T23:59:59.999Z`) } : {}),
          },
        }
        : {}),
      ...(q
        ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
            { currentPlan: { name: { contains: q, mode: 'insensitive' } } },
            { users: { some: { email: { contains: q, mode: 'insensitive' } } } },
          ],
        }
        : {}),
    };

    let orderBy = { createdAt: sortDir };
    if (sortBy === 'name') orderBy = { name: sortDir };
    else if (sortBy === 'status') orderBy = { status: sortDir };
    else if (sortBy === 'storageUsedBytes') orderBy = { storageUsedBytes: sortDir };
    else if (sortBy === 'plan') orderBy = { currentPlan: { name: sortDir } };

    const [items, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy,
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
          take: 100,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            jobTitle: true,
            mfaEnabled: true,
            roleRelation: { select: { id: true, name: true } },
            lastLoginAt: true,
            lastActiveAt: true,
            createdAt: true,
          },
        },
        moderationFlags: {
          where: { status: { in: ['open', 'quarantined'] } },
          take: 20,
          orderBy: { createdAt: 'desc' },
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

    // Load settings separately so a missing relation/table does not break the detail page.
    let settings = null;
    try {
      if (prisma.organizationSettings?.findUnique) {
        settings = await prisma.organizationSettings.findUnique({ where: { orgId } });
      }
    } catch (settingsError) {
      console.warn('getOrganization settings lookup skipped:', settingsError.message);
    }

    return { success: true, organization: serializeOrg({ ...org, settings }) };
  } catch (error) {
    console.error('getOrganization error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load organization',
      statusCode: 500,
    });
  }
}

async function createOrganization(request, reply) {
  try {
    const body = request.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Organization name is required',
        statusCode: 400,
      });
    }
    if (name.length > 100) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Organization name cannot exceed 100 characters',
        statusCode: 400,
      });
    }

    const adminEmail = body.adminEmail ? String(body.adminEmail).toLowerCase().trim() : '';
    const adminName = body.adminName ? String(body.adminName).trim() : '';

    if (adminEmail) {
      const emailValidation = await authService.validateBusinessEmail(adminEmail);
      if (!emailValidation.isValid) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: emailValidation.message || 'Please enter a valid business email address',
          statusCode: 400,
        });
      }
      const existingUser = await authService.findUserByEmail(adminEmail);
      if (existingUser) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'Admin email is already registered',
          statusCode: 409,
        });
      }
    }

    let plan = null;
    if (body.planId) {
      plan = await prisma.plan.findUnique({ where: { id: String(body.planId) } });
      if (!plan) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Plan not found',
          statusCode: 400,
        });
      }
    } else {
      plan =
        (await prisma.plan.findFirst({
          where: { isFree: true, isActive: true },
        })) || null;
    }

    const isFreePlan = Boolean(
      !plan ||
      plan.isFree ||
      plan.id === 'free' ||
      plan.id === 'none' ||
      (plan.name && plan.name.toLowerCase() === 'free')
    );
    const isPaidPlan = !isFreePlan;
    const requestedSlug = body.slug ? slugify(body.slug) : slugify(name);
    const slug = await ensureUniqueSlug(prisma, requestedSlug);

    // Create Stripe Customer if Stripe service is available
    let stripeCustomerId = null;
    try {
      const stripeService = require('../services/stripe.service');
      if (adminEmail && stripeService?.createCustomer) {
        const customer = await stripeService.createCustomer(adminEmail, name);
        stripeCustomerId = customer?.id || null;
      }
    } catch (stripeErr) {
      console.warn('[platform] Stripe customer creation skipped/failed:', stripeErr.message);
    }

    let isFreeTrialUsed = false;
    let planExpiresAt = null;

    if (isFreePlan) {
      isFreeTrialUsed = true;
      const expireDate = new Date();
      const trialDays = plan?.trialDays ? plan.trialDays : 14;
      expireDate.setDate(expireDate.getDate() + trialDays);
      planExpiresAt = expireDate;
    }

    const org = await prisma.organization.create({
      data: {
        name,
        slug,
        currentPlanId: plan?.id || null,
        status: 'active',
        subscriptionStatus: isPaidPlan ? 'past_due' : 'active',
        stripeCustomerId,
        isFreeTrialUsed,
        ...(planExpiresAt && { planExpiresAt }),
      },
    });

    await ensureDefaultOrganizationSettings(prisma, org.id);

    const workspaceName = formatWorkspaceName(name);
    const workspace = await createDefaultWorkspace(prisma, {
      name: workspaceName,
      description: `Default workspace for ${name}`,
      color: '#4f46e5',
      orgId: org.id,
      orgName: name,
    });

    let adminUser = null;
    let checkoutUrl = null;

    if (adminEmail) {
      const superAdminRole = await resolveSuperAdminRole(prisma);
      adminUser = await prisma.user.create({
        data: {
          email: adminEmail,
          name: adminName || null,
          orgId: org.id,
          roleId: superAdminRole.id,
          status: 'inactive',
          mfaEnabled: true,
        },
      });

      await prisma.workspaceUser.create({
        data: {
          workspaceId: workspace.id,
          userId: adminUser.id,
        },
      });

      // Create Stripe Checkout Session if Paid Plan & Stripe Price ID is present
      if (isPaidPlan && stripeCustomerId && plan?.stripePriceId) {
        try {
          const stripeService = require('../services/stripe.service');
          const frontendUrl =
            request.headers.origin ||
            process.env.FRONTEND_URL ||
            (process.env.NODE_ENV === 'production' ? 'https://qa.noahcloud.ai' : 'http://localhost:5173');
          const session = await stripeService.createCheckoutSession(
            stripeCustomerId,
            plan.stripePriceId,
            `${frontendUrl}/login?payment=success`,
            `${frontendUrl}/login?payment=cancelled`
          );
          checkoutUrl = session?.url || null;
        } catch (checkoutErr) {
          console.warn('[platform] Failed to create Stripe checkout session:', checkoutErr.message);
        }
      }

      try {
        await sendUserInviteEmail({
          request,
          user: adminUser,
          roleName: superAdminRole.name,
          orgName: name,
          planName: plan?.name || (isPaidPlan ? 'Paid' : 'Free'),
          checkoutUrl,
        });
      } catch (emailErr) {
        console.warn('[platform] Failed to send admin invite email:', emailErr.message);
      }
    }

    const full = await prisma.organization.findUnique({
      where: { id: org.id },
      include: {
        currentPlan: true,
        _count: { select: { users: true, workspaces: true, assets: true } },
      },
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.ORGANIZATION_CREATED,
      description: `Created org ${name} (${slug})${adminEmail ? ` with admin ${adminEmail}` : ''} [Plan: ${plan?.name || 'Free'}]`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: org.id,
    });

    return reply.status(201).send({
      success: true,
      organization: serializeOrg(full),
      adminUser: adminUser
        ? {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          status: adminUser.status,
        }
        : null,
      checkoutUrl,
    });
  } catch (error) {
    console.error('createOrganization error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to create organization',
      statusCode: 500,
    });
  }
}

async function inviteOrganization(request, reply) {
  try {
    const body = request.body || {};
    const email = body.email ? String(body.email).toLowerCase().trim() : '';

    if (!email) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Business email is required',
        statusCode: 400,
      });
    }

    const emailValidation = await authService.validateBusinessEmail(email);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: emailValidation.message || 'Please enter a valid business email address',
        statusCode: 400,
      });
    }

    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Admin email is already registered',
        statusCode: 409,
      });
    }

    const emailService = request.server.emailService || require('../services/email-service');
    const frontendUrl =
      request.headers.origin ||
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://qa.noahcloud.ai' : 'http://localhost:5173');
    const signupUrl = `${frontendUrl}/signup?email=${encodeURIComponent(email)}`;

    await emailService.sendOrganizationInvite(email, { appUrl: signupUrl });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.ORGANIZATION_CREATED, // or a new ACTIVITY_NAME like ORGANIZATION_INVITED
      description: `Invited organization with admin ${email}`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: null,
    });

    return reply.status(200).send({
      success: true,
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    console.error('inviteOrganization error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to send invite',
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
    if (body.planType !== undefined && !body.currentPlanId) {
      const plan = await prisma.plan.findFirst({
        where: {
          OR: [
            { id: String(body.planType).toLowerCase() },
            { name: { equals: String(body.planType), mode: 'insensitive' } },
          ],
        },
      });
      if (plan) {
        data.currentPlanId = plan.id;
      }
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
      }
    }
    if (body.subscriptionStatus !== undefined) {
      data.subscriptionStatus = body.subscriptionStatus;
    }

    if (body.settings !== undefined && typeof body.settings === 'object') {
      const {
        requirePasswordDefault,
        allowCommentsDefault,
        allowDownloadOriginalDefault,
        allowDownloadProxyDefault,
        showCompanyWatermarkDefault,
        defaultExpiryDays,
      } = body.settings;
      
      const settingsData = {};
      if (typeof requirePasswordDefault === 'boolean') settingsData.requirePasswordDefault = requirePasswordDefault;
      if (typeof allowCommentsDefault === 'boolean') settingsData.allowCommentsDefault = allowCommentsDefault;
      if (typeof allowDownloadOriginalDefault === 'boolean') settingsData.allowDownloadOriginalDefault = allowDownloadOriginalDefault;
      if (typeof allowDownloadProxyDefault === 'boolean') settingsData.allowDownloadProxyDefault = allowDownloadProxyDefault;
      if (typeof showCompanyWatermarkDefault === 'boolean') settingsData.showCompanyWatermarkDefault = showCompanyWatermarkDefault;
      if (typeof defaultExpiryDays === 'number') settingsData.defaultExpiryDays = defaultExpiryDays;

      if (Object.keys(settingsData).length > 0) {
        try {
          if (prisma.organizationSettings?.upsert) {
            await prisma.organizationSettings.upsert({
              where: { orgId },
              update: settingsData,
              create: { orgId, ...settingsData },
            });
          }
        } catch (settingsError) {
          console.warn('Could not save org settings:', settingsError.message);
        }
      }
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
      activityName: ACTIVITY_NAME.ORGANIZATION_UPDATED,
      description: `Updated org ${updated.name} (${updated.slug})`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
      orgId: updated.id,
    });

    let settings = null;
    try {
      if (prisma.organizationSettings?.findUnique) {
        settings = await prisma.organizationSettings.findUnique({ where: { orgId } });
      }
    } catch (settingsError) {
      console.warn('Could not load org settings:', settingsError.message);
    }

    const res = serializeOrg(updated);
    if (settings) {
      res.settings = { ...settings };
    }

    return { success: true, organization: res };
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
      activityName: ACTIVITY_NAME.WORKSPACE_UPDATED,
      description: `Updated workspace ${updated.name}`,
      activityType: ACTIVITY_TYPE.INFO,
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
  createOrganization,
  inviteOrganization,
  patchOrganization,
  updateWorkspace,
};
