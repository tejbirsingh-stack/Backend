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

async function sendUserInviteEmail({ request, user, roleName }) {
  const resetToken = await authService.createPasswordResetToken(user.id);
  const frontendUrl =
    request.headers.origin ||
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://qa.noahcloud.ai' : 'http://localhost:5173');
  const setupUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  const emailService = request.server.emailService || require('../services/email-service');
  const emailSubject = 'Welcome to Noah - Account Registered Successfully';
  const emailText = `Hello,\n\nYour account has been registered successfully with the role: ${roleName}.\n\nPlease use the following link to set up your password and access your account:\n${setupUrl}\n\nBest regards,\nNoah Team`;
  const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Welcome to Noah!</h2>
        <p>Hello,</p>
        <p>Your account has been registered successfully by a platform administrator.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 0; text-transform: capitalize;"><strong>Role:</strong> ${roleName}</p>
        </div>
        <p>To get started, please click the button below to set up your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${setupUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Set Up Password</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b;">This setup link will expire in 1 hour. If you have any questions, please reach out to your administrator.</p>
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
