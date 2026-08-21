const authService = require('../services/auth-service');
const { ensureDefaultOrganizationSettings } = require('../services/organization.service');
const { seedDefaultContentIntoWorkspace } = require('../lib/seed-default-content');

function slugify(value, fallback = 'org') {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || fallback;
}

function formatWorkspaceName(value) {
  let trimmed = String(value || 'Workspace').trim();
  if (trimmed.endsWith('-Workspace-ARK')) return trimmed;
  trimmed = trimmed
    .replace(/-Workspace$/i, '')
    .replace(/-ARK$/i, '')
    .replace(/-Workspace-ARK$/i, '')
    .trim();
  return `${trimmed || 'Workspace'}-Workspace-ARK`;
}

async function ensureUniqueSlug(prisma, baseSlug) {
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 20) {
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    attempt += 1;
    slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}${attempt}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

async function resolveSuperAdminRole(prisma) {
  let role = await prisma.role.findFirst({
    where: {
      OR: [
        { name: 'Super Admin' },
        { name: 'super_admin' },
        { name: 'SuperAdmin' },
      ],
    },
  });
  if (!role) {
    role = await prisma.role.create({
      data: { name: 'Super Admin', show: 0 },
    });
  }
  return role;
}

async function resolveRole(prisma, roleIdOrName) {
  if (!roleIdOrName) return null;
  const value = String(roleIdOrName).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(value)) {
    const byId = await prisma.role.findUnique({ where: { id: value } });
    if (byId) return byId;
  }
  return prisma.role.findFirst({
    where: {
      OR: [{ name: value }, { name: { equals: value, mode: 'insensitive' } }],
    },
  });
}

async function createDefaultWorkspace(prisma, { name, description, color, orgId, orgName, uploadedByUserId = null }) {
  const workspace = await prisma.workspace.create({
    data: {
      name,
      description,
      color: color || '#4f46e5',
      orgId,
      isDefault: true,
    },
  });

  try {
    await seedDefaultContentIntoWorkspace(prisma, {
      orgId,
      workspaceId: workspace.id,
      orgName: orgName || name,
      uploadedByUserId,
    });
  } catch (seedErr) {
    console.warn('[platform] Failed to seed default content:', seedErr.message);
  }

  return workspace;
}

async function sendUserInviteEmail({ request, user, roleName, orgName, planName, checkoutUrl }) {
  const resetToken = await authService.createPasswordResetToken(user.id);
  const frontendUrl =
    request.headers.origin ||
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://qa.noahcloud.ai' : 'http://localhost:5173');
  const setupUrl = `${frontendUrl}/reset-password?token=${resetToken}&type=invite`;

  const isPaidPlan = Boolean(checkoutUrl);
  const emailService = request.server.emailService || require('../services/email-service');
  const emailSubject = isPaidPlan
    ? `Welcome to Noah - Complete ${orgName || 'Organization'} Setup & Subscription`
    : `Welcome to Noah - Complete Your ${orgName || 'Organization'} Setup`;

  const emailText = isPaidPlan
    ? `Hello ${user.name || ''},\n\nYour organization "${orgName || 'Noah'}" has been created with the ${planName || 'Paid'} plan.\n\nPlease use the following link to set up your password and access your account:\n${setupUrl}\n\nStripe Payment Link:\n${checkoutUrl}\n\nBest regards,\nNoah Team`
    : `Hello ${user.name || ''},\n\nYour organization "${orgName || 'Noah'}" has been created.\n\nPlease use the following link to set up your password and access your account:\n${setupUrl}\n\nBest regards,\nNoah Team`;

  const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0; font-size: 24px;">Welcome to Noah Cloud!</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Organization Invitation</p>
        </div>
        <p style="color: #334155; font-size: 16px;">Hello ${user.name || 'there'},</p>
        <p style="color: #334155; font-size: 15px; line-height: 1.5;">
          Your organization <strong>${orgName || 'Noah'}</strong> has been created by a platform administrator on the <strong>${planName || 'Free'} Plan</strong>.
        </p>
        <div style="background-color: #f8fafc; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
          <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>Organization:</strong> ${orgName || '—'}</p>
          <p style="margin: 0; color: #1e293b; text-transform: capitalize;"><strong>Role:</strong> ${roleName || 'Super Admin'}</p>
        </div>
        <p style="color: #334155; font-size: 15px;">To activate your account and start using Noah, please click below to set up your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${setupUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">Set Up Password & Activate Account</a>
        </div>
        ${
          isPaidPlan
            ? `
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; color: #166534; font-weight: 600;">Paid Plan Subscription Payment:</p>
          <a href="${checkoutUrl}" style="background-color: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Complete Stripe Subscription Payment</a>
        </div>
        `
            : ''
        }
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">This invitation setup link will expire in 24 hours. If you have any questions, please contact support.</p>
      </div>
    `;

  await emailService.sendEmail({
    to: user.email,
    subject: emailSubject,
    text: emailText,
    html: emailHtml,
  });
}

module.exports = {
  slugify,
  formatWorkspaceName,
  ensureUniqueSlug,
  resolveSuperAdminRole,
  resolveRole,
  createDefaultWorkspace,
  ensureDefaultOrganizationSettings,
  sendUserInviteEmail,
  authService,
};
