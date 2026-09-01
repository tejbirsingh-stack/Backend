
const authService = require("../services/auth-service");
const { OAuth2Client } = require('google-auth-library');
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { logSuccess, logError, ACTIVITY_NAME } = require("../lib/audit-log");
const { loadUserAuthzContext } = require("../lib/rbac-access");
const { ensureDefaultOrganizationSettings } = require("../services/organization.service");
const { autoAssignAdminsToWorkspace, autoAssignNewAdminToWorkspaces } = require("../services/workspace.service");
const { createDefaultWorkspace: createDefaultWorkspaceWithStarterContent } = require("../lib/platform-provision");
const { ACCESS_LEVEL, MEMBER_TYPES } = require("../lib/rolesPermissions");
const { resolveOrgBranding } = require("../services/branding.service");

function slugifyWorkspaceName(value) {
  if (!value || typeof value !== "string") return "workspace";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const { computeAiEnabledSync } = require("../services/ai/aiEntitlement");

function formatOrganization(org) {
  if (!org) return null;
  const currentPlan = org.currentPlan || {};
  const planType = currentPlan.name
    ? currentPlan.name.toLowerCase()
    : (org.metadata?.planId || 'free');
  const storageQuotaBytes = (
    currentPlan.storageQuotaBytes !== undefined && currentPlan.storageQuotaBytes !== null
      ? currentPlan.storageQuotaBytes
      : BigInt(0)
  ).toString();
  const maxUsers = currentPlan.maxUsers ?? 5;
  const maxWorkspaces = currentPlan.maxWorkspaces ?? 1;
  const maxProjects = currentPlan.maxProjects ?? 1;
  const features = currentPlan.features ?? [];
  const isFreeTrialUsed = Boolean(org.isFreeTrialUsed);

  return {
    ...org,
    planType,
    isFreeTrialUsed,
    storageQuotaBytes,
    storageUsedBytes: org.storageUsedBytes?.toString?.() ?? '0',
    maxUsers,
    maxWorkspaces,
    maxProjects,
    features,
    aiEnabled: computeAiEnabledSync(org),
  };
}

function formatDomainToOrgName(email, defaultName) {
  try {
    if (email && typeof email === "string" && email.includes("@")) {
      const domain = email.split("@")[1];
      if (domain && domain.includes(".")) {
        const companyPart = domain.split(".")[0];
        if (companyPart && companyPart.length > 0) {
          return companyPart.charAt(0).toUpperCase() + companyPart.slice(1).toLowerCase();
        }
      }
    }
  } catch (e) {
    // fallback if domain parsing fails
  }
  return defaultName || "Workspace";
}

function formatWorkspaceNameWithSuffix(value) {
  if (!value || typeof value !== "string") return "ARK";
  let trimmed = value.trim();
  if (trimmed.endsWith("-ARK")) {
    return trimmed;
  }
  trimmed = trimmed.replace(/-Workspace$/i, "").replace(/-ARK$/i, "").replace(/-Workspace-ARK$/i, "").trim();
  return `${trimmed}-ARK`;
}

async function syncToHubspot(payload) {
  const portalId = process.env.HUBSPOT_PORTAL_ID?.trim();
  const formId = process.env.HUBSPOT_FORM_ID?.trim();
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN?.trim();

  if (!portalId || !formId) {
    console.warn("[HubSpot Sync] Skipped: HUBSPOT_PORTAL_ID or HUBSPOT_FORM_ID missing in env.");
    return;
  }

  const { email, firstName, lastName, name, workspaceName, companyWebsite, mobileNumber, teamSize, firstFocus, planId, billingCycle, hubspotUtk, referer, ip } = payload;

  let firstname = firstName ? String(firstName).trim() : "";
  let lastname = lastName ? String(lastName).trim() : "";

  if (!firstname) {
    const rawName = name || email.split("@")[0].replace(/[._]+/g, " ");
    const nameParts = rawName.split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    firstname = nameParts[0] || "User";
    if (!lastname) {
      lastname = nameParts.slice(1).join(" ") || "";
    }
  }

  let formattedWebsite = companyWebsite ? String(companyWebsite).trim() : "";
  if (formattedWebsite && !formattedWebsite.startsWith("http://") && !formattedWebsite.startsWith("https://")) {
    formattedWebsite = `https://${formattedWebsite}`;
  }

  const formattedCompany = formatWorkspaceNameWithSuffix(workspaceName || "");
  const rawFields = [
    { objectTypeId: "0-1", name: "email", value: email },
    { objectTypeId: "0-1", name: "firstname", value: firstname },
    { objectTypeId: "0-1", name: "lastname", value: lastname },
    { objectTypeId: "0-1", name: "company", value: formattedCompany },
    { objectTypeId: "0-1", name: "website", value: formattedWebsite },
    { objectTypeId: "0-1", name: "phone", value: mobileNumber || "" },
    { objectTypeId: "0-1", name: "numemployees", value: teamSize || "" },
    { objectTypeId: "0-1", name: "primary_use_case", value: firstFocus || "" },
    { objectTypeId: "0-1", name: "selected_plan", value: planId || "" },
    { objectTypeId: "0-1", name: "billing_cycle", value: billingCycle || "" },
  ];

  const validFields = rawFields.filter(f => f.value !== undefined && f.value !== null && String(f.value).trim().length > 0);

  const requestBody = {
    fields: validFields,
    context: {
      ...(hubspotUtk && typeof hubspotUtk === "string" && hubspotUtk.trim().length > 0
        ? { hutk: hubspotUtk.trim() }
        : {}),
      pageUri: process.env.FRONTEND_URL || (referer && !referer.includes("localhost") ? referer : "https://noahcloud.ai/signup"),
      pageName: "New Onboarding Signup Page",
      ipAddress: ip || "127.0.0.1",
    },
    skipValidation: true,
  };

  const secureEndpoint = `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formId}`;
  const publicEndpoint = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;

  const endpoint = accessToken ? secureEndpoint : publicEndpoint;
  const headers = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  console.log(`[HubSpot Sync] Submitting payload for ${email} (PortalID: ${portalId}, FormID: ${formId})...`);

  try {
    if (typeof fetch !== "undefined") {
      let res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      let resText = await res.text();
      if (!res.ok && accessToken) {
        console.warn(`[HubSpot Sync] Secure endpoint failed with HTTP ${res.status}: ${resText}. Retrying with public endpoint...`);
        res = await fetch(publicEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        resText = await res.text();
      }

      if (!res.ok) {
        console.error(`[HubSpot Sync ERROR] Submission failed (HTTP ${res.status}):`, resText);
      } else {
        console.log(`[HubSpot Sync SUCCESS] Synced ${email} to HubSpot! Response:`, resText);
      }
    } else {
      console.warn("[HubSpot Sync] fetch is not available in Node environment.");
    }
  } catch (err) {
    console.error("[HubSpot Sync ERROR] Connection exception:", err.message);
  }
} // 1. Login Handler
module.exports.login = async (request, reply) => {
  try {
    const { email, password, mfaCode } = request.body || {};
    // Validate input
    if (!email || !password) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Email and password are required",
      });
    }

    // Normalize email (lowercase and trim spaces) to ensure it matches the database
    const normalizedEmail = email.toLowerCase().trim();

    // Find the user
    const user = await authService.findUserByEmail(normalizedEmail);

    // Check if user exists and password is valid
    if (!user || !(await authService.verifyPassword(user.passwordHash, password))) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Invalid email or password",
      });
    }

    // Reject login if user has no roleId assigned in database
    if (!user.roleId) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "No role assigned to this user. Login rejected. Please contact administrator.",
      });
    }

    // Determine user's role name cleanly
    const roleName = (user.roleRelation && user.roleRelation.name) ? user.roleRelation.name : (user.role || "");
    const isSuperAdmin = roleName.toLowerCase().replace(/[_ -]+/g, "") === "superadmin";

    // Check user status and email verification
    if (user.status && user.status.toLowerCase() !== "active") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Account is not active",
      });
    }

    if (user.organization?.status && String(user.organization.status).toLowerCase() === "suspended") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "This organization has been suspended. Contact NOAH support.",
      });
    }

    if (!user.emailVerified) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Your account has not been verified. Please check your email and verify your account before logging in.",
      });
    }

    // Check if MFA is enabled and verify the code
    if (user.mfaEnabled) {
      if (!mfaCode) {
        // 1. Generate a 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. Calculate expiration (10 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // 3. Save OTP to user record in the database
        await request.server.prisma.user.update({
          where: { id: user.id },
          data: {
            emailOTP: otpCode,
            emailOtpExpiresAt: expiresAt
          }
        });

        // 4. Send the email using our new email service function
        const orgBranding = await resolveOrgBranding(request.server.prisma, user.orgId);
        await request.server.emailService.sendMfaCode(user.email, user.name || "User", otpCode, {
          orgLogoUrl: orgBranding?.logoUrl,
          orgName: orgBranding?.accountName,
        });
        logSuccess(ACTIVITY_NAME.USER_LOGIN, "MFA OTP sent successfully during login.", null, user);  //Log user activity

        // console.log('check'); return;
        return reply.status(400).send({
          success: false,
          error: "MFA Required",
          message: "An authentication code has been sent to your email",
          requiresMfa: true,
          mfaType: "email",
        });
      }

      // We have an mfaCode , verify 
      //Fetch the latest user record to get the OTP
      const currentUser = await request.server.prisma.user.findUnique({
        where: { id: user.id },
        select: { emailOTP: true, emailOtpExpiresAt: true }
      });

      // check if code matches and is not expired
      if (
        !currentUser.emailOTP ||
        currentUser.emailOTP !== mfaCode ||
        !currentUser.emailOtpExpiresAt ||
        new Date() > currentUser.emailOtpExpiresAt
      ) {
        return reply.status(401).send({
          success: false,
          error: "Unauthorized",
          message: "Invalid or expired authentication code",
          requiresMfa: true,
        });
      }

      // If code is valid, clear it from the database so it cannot be reused
      await request.server.prisma.user.update({
        where: { id: user.id },
        data: {
          emailOTP: null,
          emailOtpExpiresAt: null,
          lastActiveAt: new Date(),
        }
      });
    }

    // Generate JWT token with full authorization context
    const authz = await loadUserAuthzContext(request.server.prisma, user.id);
    const permissions = authz?.permissions || [];
    const allowedProjectIds = authz?.allowedProjectIds || [];

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: user.orgId,
      roleId: user.roleId,
      role: user.role || (user.roleRelation ? user.roleRelation.name : null),
      permissions,
      allowedProjectIds,
      organization: user.organization,
      timezone: user.timezone,
      avatarUrl: user.avatarUrl,
      shareLinkActivityEnabled: user.shareLinkActivityEnabled,
      preferences: user.preferences
    };
    const token = await reply.jwtSign(payload);

    // Save real JWT token in UserSession table
    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip,
      token
    );

    // Update last login and activity timestamps
    await request.server.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    logSuccess(ACTIVITY_NAME.USER_LOGIN, "Login successful.", null, user);  //Log user activity

    return {
      success: true,
      accessToken: token,
      token: session.token,
      expiresAt: session.expiresAt
    };

  } catch (error) {
    console.error("Login error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to process login",
      details: error.message || String(error)
    });
  }
};


module.exports.register = async (request, reply) => {
  const { name, email, password, orgId, orgName, phone, hubspotUtk, planId } = request.body;

  try {
    // Validate required fields
    if (!name || !email || !password) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Name, email, and password are required",
      });
    }

    if (name.length > 100) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Name cannot exceed 100 characters",
      });
    }

    if (email.length > 255) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Email cannot exceed 255 characters",
      });
    }

    if (phone && phone.length > 50) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Phone number cannot exceed 50 characters",
      });
    }

    // Validate business email domain (Layer 1: Free domain check, Layer 2: DNS MX verification)
    const emailValidation = await authService.validateBusinessEmail(email);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        error: "Bad Request",
        message: emailValidation.message,
      });
    }

    // Check if email already exists
    const existingUser = await authService.findUserByEmail(email);

    if (existingUser) {
      return reply.status(409).send({
        error: "Conflict",
        message: "Email is already registered",
      });
    }

    let finalOrgId = orgId;
    let organization = null;

    // If orgId is provided, validate and check if it exists
    if (finalOrgId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(finalOrgId)) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid organization ID format. Must be a valid 36-character UUID string.",
        });
      }

      organization = await request.server.prisma.organization.findUnique({
        where: { id: finalOrgId },
      });

      if (!organization) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid organization ID: Organization not found",
        });
      }
    } else {
      // Auto-generate a new Organization if orgId was not provided
      const slugBase = email.split('@')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const derivedOrgName = formatDomainToOrgName(email, orgName || name);
      const rawOrgName = orgName || name || email.split('@')[0];
      const formattedWorkspaceName = formatWorkspaceNameWithSuffix(rawOrgName);
      let plan = null;
      if (planId) {
        plan = await request.server.prisma.plan.findUnique({
          where: { id: planId }
        });
      }
      if (!plan) {
        plan = await request.server.prisma.plan.findFirst({
          where: { isFree: true, isActive: true }
        });
      }

      const isFreePlan = Boolean(plan && plan.isFree);
      let planExpiresAt = null;

      if (isFreePlan) {
        const trialDays = plan.trialDays ?? 3;
        const expires = new Date();
        expires.setDate(expires.getDate() + trialDays);
        planExpiresAt = expires;
      }

      organization = await request.server.prisma.organization.create({
        data: {
          name: derivedOrgName,
          slug: `${slugBase}-${Date.now()}`,
          currentPlanId: plan ? plan.id : null,
          isFreeTrialUsed: isFreePlan,
          planExpiresAt: planExpiresAt,
        },
        include: { currentPlan: true },
      });
      finalOrgId = organization.id;

      // Automatically create a default workspace for the new organization
      const newWorkspace = await request.server.prisma.workspace.create({
        data: {
          name: formattedWorkspaceName,
          description: "Default workspace for " + name,
          color: "#4f46e5",
          orgId: finalOrgId,
          visibility: 'public',
          isDefault: true,
        }
      });

      // Store the new workspace ID to auto-assign the user later
      request.newWorkspaceId = newWorkspace.id;

      // Automatically create default share settings for the new organization
      await ensureDefaultOrganizationSettings(request.server.prisma, finalOrgId);
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);
    let superAdminRole = await request.server.prisma.role.findFirst({
      where: {
        OR: [
          { id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15" },
          { name: "Super Admin" },
          { name: "super_admin" },
          { name: "SuperAdmin" }
        ]
      }
    });
    if (!superAdminRole) {
      superAdminRole = await request.server.prisma.role.findFirst();
    }
    if (!superAdminRole) {
      superAdminRole = await request.server.prisma.role.create({
        data: {
          id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15",
          name: "Super Admin",
          show: 0,
        }
      });
    }

    if (!superAdminRole || !superAdminRole.id) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Super Admin role ID not found. Registration cannot proceed without a valid role ID.",
      });
    }

    // Store user in database
    const user = await request.server.prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        orgId: finalOrgId,
        roleId: superAdminRole.id,
        phone: phone || null,
        hubspotUtk: hubspotUtk || null,
        status: "active",
        failedLoginAttempts: 0,
        mfaEnabled: true, // Enable MFA by default for all new users
      },
    });

    // Assign Super Admins / Admins to this newly created workspace (which skips public now)
    if (request.newWorkspaceId) {
      await autoAssignAdminsToWorkspace(request.server.prisma, finalOrgId, request.newWorkspaceId);
    }

    // --- HUBSPOT BACKGROUND SYNC BLOCK ---
    const portalId = process.env.HUBSPOT_PORTAL_ID?.trim();
    const formId = process.env.HUBSPOT_FORM_ID?.trim();
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN?.trim();

    if (portalId && formId) {
      // Split name into first and last name for HubSpot
      const [firstname, ...lastnameParts] = name.split(" ");
      const lastname = lastnameParts.join(" ") || "";
      const hubspotEndpoint = `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formId}`;

      const headers = { "Content-Type": "application/json" };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      // Call HubSpot API in the background so it doesn't block the user's response
      if (typeof fetch !== 'undefined') {
        fetch(hubspotEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: [
              { objectTypeId: "0-1", name: "email", value: email },
              { objectTypeId: "0-1", name: "firstname", value: firstname },
              { objectTypeId: "0-1", name: "lastname", value: lastname },
              { objectTypeId: "0-1", name: "company", value: organization ? organization.name : "" },
              { objectTypeId: "0-1", name: "phone", value: phone || "" },
            ],
            context: {
              ...(hubspotUtk && typeof hubspotUtk === "string" && hubspotUtk.trim().length > 0
                ? { hutk: hubspotUtk.trim() }
                : {}),
              pageUri: request.headers.referer || "",
              pageName: "Register Page",
              ipAddress: request.ip,
            },
            skipValidation: true,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errText = await res.text();
              console.error("HubSpot Form submit failed response:", errText);
            } else {
              console.log("Successfully synced registration to HubSpot Form");
            }
          })
          .catch((err) => {
            console.error("HubSpot Form API Connection error:", err.message);
          });
      } else {
        console.warn("fetch is not defined, skipping HubSpot background sync.");
      }
    }

    // Generate email verification token and send verification email
    try {
      const verificationToken = await authService.createEmailVerificationToken(user.id);
      const frontendUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");
      const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
      const emailService = request.server.emailService || require("../services/email-service");
      const orgBranding = await resolveOrgBranding(request.server.prisma, user.orgId);
      await emailService.sendEmailVerification(user.email, user.name || "User", verificationUrl, {
        orgLogoUrl: orgBranding?.logoUrl,
        orgName: orgBranding?.accountName,
      });
    } catch (emailErr) {
      console.error("Failed to send verification email during registration:", emailErr);
    }

    user.role = superAdminRole?.name;
    logSuccess(ACTIVITY_NAME.USER_REGISTER, "User registered successfully. Verification email sent.", null, user);  //Log user activity

    return reply.status(201).send({
      message: "User registered successfully. Please check your email and verify your account before logging in.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        role: user.role,
        status: user.status,
        phone: user.phone,
        emailVerified: false,
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);

    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to register user",
      details: error.message || String(error)
    });
  }
};


module.exports.registerRole = async (request, reply) => {
  const { email, roleId, orgId } = request.body || {};

  try {
    // 1. Verify that the authenticated user is a Super Admin
    let currentUserRole = request.user?.role || "";
    if (request.user?.id) {
      const liveUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        include: { roleRelation: true },
      });
      if (liveUser && liveUser.roleRelation && liveUser.roleRelation.name) {
        currentUserRole = liveUser.roleRelation.name;
      } else if (liveUser && liveUser.role) {
        currentUserRole = liveUser.role;
      }
    }
    const normalizedRole = currentUserRole.toLowerCase().replace(/[_ -]+/g, "");

    if (normalizedRole !== "superadmin" && normalizedRole !== "admin") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Access denied. Only Super Admin or Admin can register new users with roles.",
      });
    }

    // 2. Validate required fields
    if (!email || !roleId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Email and role are required",
      });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Validate business email domain (Layer 1: Free domain check, Layer 2: DNS MX verification)
    const emailValidation = await authService.validateBusinessEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: emailValidation.message,
      });
    }

    // 3. Check if email is already registered
    const existingUser = await authService.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return reply.status(409).send({
        success: false,
        error: "Conflict",
        message: "User with this email is already registered",
      });
    }

    // 4. Determine Organization ID (Use provided orgId or fall back to Super Admin's orgId)
    const finalOrgId = orgId || request.user?.orgId;
    if (!finalOrgId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Organization ID is required or could not be determined from admin session",
      });
    }

    // Validate that the organization exists in database
    const organization = await request.server.prisma.organization.findUnique({
      where: { id: finalOrgId },
      include: { currentPlan: true },
    });
    if (!organization) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Invalid organization ID: Organization not found",
      });
    }

    // Check organization seat limit (capacity)
    const maxUsers = organization.currentPlan?.maxUsers ?? organization.maxUsers ?? 10;
    const currentUsersCount = await request.server.prisma.user.count({
      where: { orgId: finalOrgId },
    });

    if (currentUsersCount >= maxUsers) {
      return reply.status(403).send({
        success: false,
        error: "SeatLimitReached",
        message: "Member seat limit reached. Please upgrade your plan to add more members.",
      });
    }



    // 5. Fetch role from Roles table where id = roleId or name = roleId
    if (!roleId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Role is not found",
      });
    }

    let roleObj = null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(roleId)) {
      roleObj = await request.server.prisma.role.findUnique({
        where: { id: roleId },
      });
    }
    if (!roleObj) {
      roleObj = await request.server.prisma.role.findFirst({
        where: {
          OR: [
            { name: roleId },
            { name: { equals: roleId, mode: "insensitive" } }
          ]
        }
      });
    }

    if (!roleObj || !roleObj.id) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Role is not found",
      });
    }

    // 6. Save ONLY email, roleId, role name, and orgId to the database
    const user = await request.server.prisma.user.create({
      data: {
        email: normalizedEmail,
        roleId: roleObj.id,
        orgId: finalOrgId,
        status: "inactive",
        mfaEnabled: true, // Default to true as per existing registration logic
      },
    });
    user.role = roleObj.name;

    if (['Super Admin', 'Admin', 'Platform Admin'].includes(user.role)) {
      if (user.orgId) {
        await autoAssignNewAdminToWorkspaces(request.server.prisma, user.orgId, user.id);
      }
    }

    // 7. Generate Password Setup Token
    const resetToken = await authService.createPasswordResetToken(user.id);
    const frontendUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");
    const setupUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // 8. Send Registration & Password Setup Email to the User
    const emailService = request.server.emailService || require("../services/email-service");
    const emailSubject = "Welcome to Noah - Account Registered Successfully";
    const emailText = `Hello,\n\nYour account has been registered successfully with the role: ${user.role}.\n\nPlease use the following link to set up your password and access your account:\n${setupUrl}\n\nBest regards,\nNoah Team`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Welcome to Noah!</h2>
        <p>Hello,</p>
        <p>Your account has been registered successfully by an administrator.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 0; text-transform: capitalize;"><strong>Role:</strong> ${user.role}</p>
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

    logSuccess(ACTIVITY_NAME.USER_INVITED, `Invited new user "${user.email}" with role "${user.role}".`, request);

    // 9. Return success response (No HubSpot sync performed)
    return reply.status(201).send({
      success: true,
      message: "User registered and invitation email sent successfully",
      user: {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        role: user.role,
        orgId: user.orgId,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Register Role Error:", error);
    logError(ACTIVITY_NAME.USER_INVITED, `Failed to invite user "${email || ''}".`, request, error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to register user role",
      details: error.message || String(error),
    });
  }
};


// 4. Setup MFA Handler
module.exports.setupMfa = async (request, reply) => {
  try {
    const userId = request.user.id;

    // Generate a new TOTP secret
    const secret = authService.generateTotpSecret();

    // Store the secret but don't enable MFA yet (will be enabled after verification)
    await request.server.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret,
        mfaEnabled: false,
      },
    });

    // Generate the OTP URI for QR code generation
    const otpUri = authService.generateTotpUri(request.user.email, secret);

    return {
      secret,
      otpUri,
    };
  } catch (error) {
    console.error("MFA setup error:", error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to setup MFA",
    });
  }
};

// 5. Enable MFA Handler
module.exports.enableMfa = async (request, reply) => {
  const { code } = request.body;

  try {
    // Validate input
    if (!code) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Verification code is required",
      });
    }

    // Get the user with MFA secret
    const user = await request.server.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, mfaSecret: true },
    });

    // Check if the user has a secret
    if (!user.mfaSecret) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "MFA has not been setup",
      });
    }

    // Verify the code
    if (!authService.verifyTotp(code, user.mfaSecret)) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid verification code",
      });
    }

    // Enable MFA
    await request.server.prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true },
    });

    return { message: "MFA enabled successfully" };
  } catch (error) {
    console.error("MFA enable error:", error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to enable MFA",
    });
  }
};

// 6. Disable MFA Handler
module.exports.disableMfa = async (request, reply) => {
  try {
    // Update the user
    await request.server.prisma.user.update({
      where: { id: request.user.id },
      data: {
        mfaSecret: null,
        mfaEnabled: false,
      },
    });

    return { message: "MFA disabled successfully" };
  } catch (error) {
    console.error("MFA disable error:", error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to disable MFA",
    });
  }
};

// 7. Get Me Currently User Info (Dynamic Profile Fetch with Role Relation)
module.exports.getMe = async (request, reply) => {
  try {
    if (!request.user || !request.user.id) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    const user = await request.server.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        orgId: true,
        roleId: true,
        status: true,
        emailVerified: true,
        phone: true,
        jobTitle: true,
        timezone: true,
        avatarUrl: true,
        mfaEnabled: true,
        shareLinkActivityEnabled: true,
        preferences: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            currentPlanId: true,
            currentPlan: true,
            storageUsedBytes: true,
            metadata: true,
            planExpiresAt: true,
            isFreeTrialUsed: true,
          },
        },
        roleRelation: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    slug: true
                  }
                }
              }
            }
          },
        },
      },
    });

    if (!user || !user.roleId) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "No role assigned to this user",
      });
    }

    // Dynamically set user's role based on the Role table relation (by roleId)
    if (user.roleRelation && user.roleRelation.name) {
      user.role = user.roleRelation.name;
      if (user.roleRelation.permissions) {
        user.permissions = user.roleRelation.permissions.map(p => p.permission.slug);
      } else {
        user.permissions = [];
      }
    } else if (user.roleId) {
      const roleObj = await request.server.prisma.role.findUnique({
        where: { id: user.roleId },
        select: {
          id: true,
          name: true,
          permissions: {
            select: {
              permission: {
                select: { slug: true }
              }
            }
          }
        },
      });
      if (roleObj && roleObj.name) {
        user.role = roleObj.name;
        user.roleRelation = roleObj;
        user.permissions = roleObj.permissions ? roleObj.permissions.map(p => p.permission.slug) : [];
      } else {
        user.permissions = [];
      }
    } else {
      user.permissions = [];
    }

    const projectUsers = await request.server.prisma.projectUser.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    if (user?.organization) {
      user.organization = formatOrganization(user.organization);
    }

    return {
      success: true,
      user: user,
    };
  } catch (error) {
    console.error("Get me error:", error);
    return reply.status(500).send({
      success: false,
      error: `Internal Server Error, ${error.message}`,
      message: "Failed to fetch current user profile",
    });
  }
};

// 8. Forgot Password Handler
module.exports.forgotPassword = async (request, reply) => {
  const { email } = request.body || {};

  try {
    // Validate input
    if (!email || typeof email !== "string" || !email.trim()) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Email is required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find the user by email in user table
    const user = await authService.findUserByEmail(cleanEmail);

    if (!user) {
      return reply.status(404).send({
        error: "Not Found",
        message: "No account found with this email address.",
      });
    }

    if (user.status !== "active") {
      return reply.status(400).send({
        error: "Bad Request",
        message: "This account is inactive or suspended.",
      });
    }

    // Generate dedicated password-reset JWT with 12-hour expiry and unique jti
    const resetToken = await authService.createPasswordResetToken(user.id);

    const frontendUrl =
      request.headers.origin ||
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:3002");
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const emailService = request.server?.emailService || require("../services/email-service");
    const emailSender = emailService.sendPasswordReset ? emailService : (new (require("../services/email-service"))());
    const orgBranding = await resolveOrgBranding(request.server.prisma, user.orgId);
    await emailSender.sendPasswordReset(user.email, user.name, resetUrl, {
      orgLogoUrl: orgBranding?.logoUrl,
      orgName: orgBranding?.accountName,
    });

    logSuccess(ACTIVITY_NAME.FORGOT_PASSWORD, "Password reset link requested.", null, user);

    return reply.send({
      success: true,
      message: `Password reset link has been sent to ${user.email}.`,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    logError("FORGOT PASSWORD", "Password reset link request failed.", request, error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to process password reset request",
    });
  }
};

// 8b. Validate Reset Token Handler
module.exports.validateResetToken = async (request, reply) => {
  const token = request.query?.token || request.body?.token;

  if (!token) {
    return reply.status(400).send({
      valid: false,
      message: "Token is required",
    });
  }

  try {
    const validation = await authService.validatePasswordResetToken(token);

    if (!validation) {
      return reply.status(400).send({
        valid: false,
        message: "This link is invalid or has expired. Please request a new link.",
      });
    }

    const isInvite = Boolean(
      validation.user.status === 'inactive' ||
      validation.user.status === 'pending' ||
      !validation.user.passwordHash
    );

    return reply.send({
      valid: true,
      isInvite,
      userStatus: validation.user.status,
    });
  } catch (error) {
    console.error("Validate reset token error:", error);
    return reply.status(400).send({
      valid: false,
      message: "This link is invalid or has expired. Please request a new link.",
    });
  }
};

// 9. Reset Password Handler
module.exports.resetPassword = async (request, reply) => {
  const { token, password, confirmPassword, newPassword } = request.body || {};
  const finalPassword = password || newPassword;
  const matchConfirmPassword = confirmPassword || finalPassword;

  try {
    // Validate input
    if (!token || !finalPassword) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Token and password are required",
      });
    }

    if (finalPassword !== matchConfirmPassword) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Password and confirm password must match",
      });
    }

    await authService.resetUserPassword(token, finalPassword);

    return reply.send({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return reply.status(400).send({
      error: "Bad Request",
      message: error.message || "Failed to reset password",
    });
  }
};

//10. Google Login Hander
module.exports.googleLogin = async (request, reply) => {
  const { idToken } = request.body || {};
  const clientId = process.env.GOOGLE_CLIENT_ID || "967923512322-0oullb620hh9se1ff0prs8stvbspi829.apps.googleusercontent.com";
  const googleClient = new OAuth2Client(clientId);

  // Global SSO enforcement check
  try {
    const globalSetting = await request.server.prisma.globalAdminSetting.findFirst();
    if (globalSetting && !globalSetting.ssoConfigured) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Single sign-on (SSO) is disabled by Global Admin.",
      });
    }
  } catch (settingErr) {
    console.error("Error checking global SSO setting:", settingErr);
  }

  if (!idToken) {
    return reply.status(400).send({
      success: false,
      error: "Bad Request",
      message: "Google idToken is required",
    });
  }

  let email, name;

  try {
    // Check if token is a JWT ID token or OAuth access token
    if (idToken.startsWith('eyJ') || idToken.split('.').length === 3) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: idToken,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        email = payload.email;
        name = payload.name;
      } catch (jwtErr) {
        console.warn("verifyIdToken failed, falling back to userinfo API:", jwtErr.message);
      }
    }

    // If email is still not extracted, try the userinfo endpoint (for access tokens)
    if (!email) {
      const googleResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      if (!googleResponse.ok) {
        throw new Error("INVALID_TOKEN: Failed to verify token with Google");
      }

      const payload = await googleResponse.json();
      email = payload?.email;
      name = payload?.name;
    }

    if (!email) {
      throw new Error("INVALID_TOKEN: Could not extract email from Google token");
    }
  } catch (authError) {
    console.error("Google Token Verification Error:", authError);
    logError(ACTIVITY_NAME.USER_LOGIN, "Google Token Verification Error.", request, authError);
    return reply.status(401).send({
      success: false,
      error: "Unauthorized",
      message: "Invalid or expired Google token",
      details: authError.message
    });
  }

  try {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Validate business email domain (B2B check: Layer 1 Free domain check & Layer 2 DNS MX verification)
    const emailValidation = await authService.validateBusinessEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: emailValidation.message,
      });
    }

    // b. Extract user info from verified token
    let user = await authService.findUserByEmail(normalizedEmail);

    // Reject login if existing user has no roleId assigned in database
    if (user && !user.roleId) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "No role assigned to this user. Login rejected. Please contact administrator.",
      });
    }

    // c. Reject login if user is not registered and mode is login
    if (!user) {
      if (!request.body?.isSignUp && request.body?.mode !== "signup") {
        return reply.status(404).send({
          success: false,
          error: "Not Found",
          message: "Email ID is not registered. Please sign up first.",
        });
      }
      const derivedOrgName = formatDomainToOrgName(normalizedEmail, name || "User");
      const rawOrgName = name || normalizedEmail.split('@')[0];
      const formattedWorkspaceName = formatWorkspaceNameWithSuffix(rawOrgName);
      const orgSlug = `workspace-${crypto.randomBytes(4).toString("hex")}`;

      const freePlan = await request.server.prisma.plan.findFirst({
        where: { name: { equals: 'free', mode: 'insensitive' } }
      });
      const organization = await request.server.prisma.organization.create({
        data: {
          name: derivedOrgName,
          slug: orgSlug,
          currentPlanId: freePlan ? freePlan.id : null,
          isFreeTrialUsed: false,
        },
        include: { currentPlan: true },
      });
      let defaultRole = await request.server.prisma.role.findFirst({
        where: {
          OR: [
            { id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15" },
            { name: "Super Admin" },
            { name: "super_admin" },
            { name: "SuperAdmin" }
          ]
        }
      });
      if (!defaultRole) {
        defaultRole = await request.server.prisma.role.findFirst();
      }
      if (!defaultRole) {
        defaultRole = await request.server.prisma.role.create({
          data: {
            id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15",
            name: "Super Admin",
            show: 0,
          }
        });
      }

      if (!defaultRole || !defaultRole.id) {
        return reply.status(400).send({
          success: false,
          error: "Bad Request",
          message: "Default role ID not found. Registration cannot proceed without a valid role ID.",
        });
      }

      // Create User
      user = await request.server.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
          orgId: organization.id,
          roleId: defaultRole.id,
          status: "active",
          mfaEnabled: true, // Enable MFA by default for all new users
          lastActiveAt: new Date(),
        }
      });

      //get first name from name
      const fullName = name || normalizedEmail.split('@')[0];
      const firstName = fullName.trim().split(/\s+/)[0];

      // Automatically create a default workspace for the new organization
      const newWorkspace = await request.server.prisma.workspace.create({
        data: {
          name: formattedWorkspaceName,
          description: "Default workspace for " + fullName,
          color: "#4f46e5",
          orgId: organization.id,
          visibility: 'public',
          isDefault: true,
        }
      });

      // Assign Super Admins / Admins
      await autoAssignAdminsToWorkspace(request.server.prisma, organization.id, newWorkspace.id);



      // Automatically create default share settings for the new organization
      await ensureDefaultOrganizationSettings(request.server.prisma, organization.id);

      // Attach organization to user object for the response payload
      user.organization = {
        id: organization.id,
        name: organization.name,
        slug: organization.slug
      };
      // HubSpot Sync for Auto-provisioned user
      const portalId = process.env.HUBSPOT_PORTAL_ID;
      const formId = process.env.HUBSPOT_FORM_ID;
      const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
      if (portalId && formId && hubspotToken) {
        const fallbackName = name || normalizedEmail.split('@')[0];
        const nameParts = fallbackName.trim().split(" ").filter(Boolean);
        const firstname = nameParts[0] || "";
        const lastname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
        const hubspotEndpoint = `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formId}`;

        // Run in background
        fetch(hubspotEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${hubspotToken}`,
          },
          body: JSON.stringify({
            fields: [
              { objectTypeId: "0-1", name: "email", value: normalizedEmail },
              { objectTypeId: "0-1", name: "firstname", value: firstname },
              { objectTypeId: "0-1", name: "lastname", value: lastname },
              { objectTypeId: "0-1", name: "company", value: orgName },
              { objectTypeId: "0-1", name: "phone", value: "" },
            ],
            context: {
              pageName: "Google Auto-Signup",
            },
            skipValidation: true,
          }),
        })
          .then(res => res.ok ? console.log("Google Signup synced to HubSpot") : console.error("HubSpot Sync Failed"))
          .catch(err => console.error("HubSpot Sync error:", err.message));
      }
    }

    // d. Check if Account is active
    if (user.status !== "active") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Account is not active",
      });
    }

    // e. Generate Internal JWT
    const internalPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      organization: user.organization
    };
    const internalToken = await reply.jwtSign(internalPayload);

    // Create session in database with the real JWT token
    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip,
      internalToken
    );

    logSuccess(ACTIVITY_NAME.USER_LOGIN, "Google login successful.", null, user);

    // f. Return the standard auth response
    return {
      success: true,
      message: "Google login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        status: user.status,
        organization: user.organization
      },
      accessToken: internalToken,
      token: session.token,
      expiresAt: session.expiresAt,
    };
  } catch (error) {
    console.error("Google Login Database/Session error:", error);
    logError(ACTIVITY_NAME.USER_LOGIN, "Google login failed.", request, error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to complete Google login process",
      details: error.message
    });
  }
}

// 11. Microsoft Login Handler
module.exports.microsoftLogin = async (request, reply) => {
  const { idToken } = request.body;
  const clientId = process.env.MICROSOFT_CLIENT_ID;

  // Global SSO enforcement check
  try {
    const globalSetting = await request.server.prisma.globalAdminSetting.findFirst();
    if (globalSetting && !globalSetting.ssoConfigured) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Single sign-on (SSO) is disabled by Global Admin.",
      });
    }
  } catch (settingErr) {
    console.error("Error checking global SSO setting:", settingErr);
  }

  if (!idToken) {
    return reply.status(400).send({
      success: false,
      error: "Bad Request",
      message: "Microsoft idToken is required",
    });
  }

  try {
    // 1. Fetch Microsoft's public keys dynamically 
    const client = jwksClient({
      jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    });

    function getKey(header, callback) {
      client.getSigningKey(header.kid, function (err, key) {
        if (err) {
          callback(err, null);
        } else {
          const signingKey = key.publicKey || key.rsaPublicKey;
          callback(null, signingKey);
        }
      });
    }

    // 2. Verify the Token
    const decodedPayload = await new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        getKey,
        {
          audience: clientId,
          // We intentionally do not strictly validate the 'issuer' string here 
          // because Microsoft multi-tenant issues dynamic issuers based on the user's specific organization tenant.
        },
        (err, decoded) => {
          if (err) reject(err);
          resolve(decoded);
        }
      );
    });

    // Extract user info (Microsoft uses 'preferred_username' or 'email' or 'upn')
    const email = (decodedPayload.preferred_username || decodedPayload.email || decodedPayload.upn).toLowerCase().trim();
    const name = decodedPayload.name || email.split("@")[0];

    // Validate business email domain (B2B check: Layer 1 Free domain check & Layer 2 DNS MX verification)
    const emailValidation = await authService.validateBusinessEmail(email);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: emailValidation.message,
      });
    }

    let user = await authService.findUserByEmail(email);

    // Reject login if existing user has no roleId assigned in database
    if (user && !user.roleId) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "No role assigned to this user. Login rejected. Please contact administrator.",
      });
    }

    if (!user) {
      if (!request.body?.isSignUp && request.body?.mode !== "signup") {
        return reply.status(404).send({
          success: false,
          error: "Not Found",
          message: "Email ID is not registered. Please sign up first.",
        });
      }
      // Auto-generate a new Organization if they are a new user
      const slugBase = email.split("@")[0].replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const derivedOrgName = formatDomainToOrgName(email, name || "User");
      const rawOrgName = name || email.split("@")[0];
      const formattedWorkspaceName = formatWorkspaceNameWithSuffix(rawOrgName);

      const freePlan = await request.server.prisma.plan.findFirst({
        where: { name: { equals: 'free', mode: 'insensitive' } }
      });
      const organization = await request.server.prisma.organization.create({
        data: {
          name: derivedOrgName,
          slug: `${slugBase}-${Date.now()}`,
          currentPlanId: freePlan ? freePlan.id : null,
          isFreeTrialUsed: false,
        },
        include: { currentPlan: true },
      });

      let defaultRole = await request.server.prisma.role.findFirst({
        where: {
          OR: [
            { id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15" },
            { name: "Super Admin" },
            { name: "super_admin" },
            { name: "SuperAdmin" }
          ]
        }
      });
      if (!defaultRole) {
        defaultRole = await request.server.prisma.role.findFirst();
      }
      if (!defaultRole) {
        defaultRole = await request.server.prisma.role.create({
          data: {
            id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15",
            name: "Super Admin",
            show: 0,
          }
        });
      }

      if (!defaultRole || !defaultRole.id) {
        return reply.status(400).send({
          success: false,
          error: "Bad Request",
          message: "Default role ID not found. Registration cannot proceed without a valid role ID.",
        });
      }

      //4. Create the new User
      user = await request.server.prisma.user.create({
        data: {
          name,
          email,
          passwordHash: "oauth-user-no-password", // Dummy password since they use Microsoft
          orgId: organization.id,
          roleId: defaultRole.id,
          status: "active",
          mfaEnabled: false, // Optional: disable MFA for SSO users
        },
      });


      //get first name from name
      const firstName = name.trim().split(/\s+/)[0];

      // Automatically create a default workspace for the new organization
      const newWorkspace1 = await request.server.prisma.workspace.create({
        data: {
          name: formattedWorkspaceName,
          description: "Default workspace for " + name,
          color: "#4f46e5",
          orgId: organization.id,
          visibility: 'public',
          isDefault: true,
        }
      });
      await autoAssignAdminsToWorkspace(request.server.prisma, organization.id, newWorkspace1.id);

      // Automatically create a default workspace for the new organization
      const newWorkspace2 = await request.server.prisma.workspace.create({
        data: {
          name: orgName + " Workspace",
          description: "Default workspace for " + orgName,
          color: "#4f46e5",
          orgId: organization.id,
          visibility: 'public',
          isDefault: true,
        }
      });
      await autoAssignAdminsToWorkspace(request.server.prisma, organization.id, newWorkspace2.id);



      // Automatically create default share settings for the new organization
      await ensureDefaultOrganizationSettings(request.server.prisma, organization.id);
    }

    if (user.status !== "active") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Account is not active",
      });
    }

    // 5. Generate Internal JWT
    const internalPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      organization: user.organization
    };
    const internalToken = await reply.jwtSign(internalPayload);

    // 6. Create Session in database with real JWT token
    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip,
      internalToken
    );

    logSuccess(ACTIVITY_NAME.USER_LOGIN, "Microsoft login successful.", null, user);

    return reply.status(200).send({
      success: true,
      message: "Microsoft login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        role: user.role,
        status: user.status,
        organization: user.organization
      },
      accessToken: internalToken,
      token: session.token, // Used by your frontend storage
      expiresAt: session.expiresAt,
    });

  } catch (error) {
    console.error("Microsoft Login Error:", error);
    logError(ACTIVITY_NAME.USER_LOGIN, "Microsoft login failed.", request, error);
    return reply.status(401).send({
      success: false,
      error: "Unauthorized",
      message: "Invalid Microsoft token",
      details: error.message,
    });
  }
}

// Get Roles Handler
module.exports.getRoles = async (request, reply) => {
  try {
    const roles = await request.server.prisma.role.findMany({
      where: {
        show: 1,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return {
      success: true,
      roles,
    };
  } catch (error) {
    console.error("Get roles error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch roles",
      details: error.message || String(error),
    });
  }
};

// Verify Email Handler
module.exports.verifyEmail = async (request, reply) => {
  const { token } = request.body || request.query || {};

  try {
    if (!token) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "This verification link is invalid or has already been used.",
      });
    }

    const userId = await authService.verifyEmailVerificationToken(token);

    if (!userId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "This verification link is invalid or has already been used.",
      });
    }

    return reply.status(200).send({
      success: true,
      message: "Your email address has been verified successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to verify email address.",
    });
  }
};

// Get Roles Handler
module.exports.getRoles = async (request, reply) => {
  try {
    const roles = await request.server.prisma.role.findMany({
      where: {
        show: 1,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return {
      success: true,
      roles,
    };
  } catch (error) {
    console.error("Get roles error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch roles",
      details: error.message || String(error),
    });
  }
};



// Logout Handler
module.exports.logout = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token && token !== "undefined" && token !== "null") {
        await authService.revokeSession(token);

        // If the token is a JWT that wasn't stored in UserSession during jwtSign,
        // blacklist it by storing it in UserSession marked as revoked so auth-middleware blocks it immediately.
        if (request.server && request.server.prisma && token.split(".").length === 3) {
          const existingSession = await request.server.prisma.userSession.findFirst({
            where: { token },
          });
          if (!existingSession) {
            const userId = request.user?.id || "unknown";
            // Check if user actually exists before creating session row to avoid FK errors
            const userExists = userId !== "unknown" ? await request.server.prisma.user.findUnique({ where: { id: userId } }) : null;
            if (userExists) {
              await request.server.prisma.userSession.create({
                data: {
                  userId: userId,
                  token: token,
                  userAgent: request.headers["user-agent"] || "Unknown",
                  ipAddress: request.ip || "Unknown",
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                  revokedAt: new Date(),
                  lastActiveAt: new Date(),
                },
              });
            }
          }
        }
      }
    }

    return reply.status(200).send({
      success: true,
      message: "Successfully logged out and session revoked",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return reply.status(200).send({
      success: true,
      message: "Logged out locally",
    });
  }
};

// Check Email Availability Handler
module.exports.checkEmail = async (request, reply) => {
  try {
    const { email } = request.body || {};
    if (!email) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Work email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Business email validation
    const emailValidation = await authService.validateBusinessEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: emailValidation.message,
      });
    }

    const existingUser = await request.server.prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (existingUser && (existingUser.passwordHash || existingUser.status === "active")) {
      return reply.status(409).send({
        success: false,
        error: "Conflict",
        exists: true,
        message: "Email ID is already registered with this email",
      });
    }

    return reply.status(200).send({
      success: true,
      exists: false,
      message: "Email is available",
    });
  } catch (error) {
    console.error("checkEmail error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to check email availability",
      details: error.message || String(error),
    });
  }
};

// Send Signup OTP Handler
module.exports.sendSignupOtp = async (request, reply) => {
  try {
    const { email } = request.body || {};
    if (!email) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Work email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Business email validation
    const emailValidation = await authService.validateBusinessEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: emailValidation.message,
      });
    }

    // Check if email already registered with password or active status
    const existingUser = await authService.findUserByEmail(normalizedEmail);
    if (existingUser && (existingUser.passwordHash || existingUser.status === "active")) {
      return reply.status(409).send({
        success: false,
        error: "Conflict",
        message: "Email ID is already registered with this email",
      });
    }

    // Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let targetOrgId = null;

    if (existingUser) {
      await request.server.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          emailOTP: otpCode,
          emailOtpExpiresAt: expiresAt,
        },
      });
      targetOrgId = existingUser.orgId;
    } else {
      // Create a new organization for pending registration using email domain
      const derivedOrgName = formatDomainToOrgName(normalizedEmail);
      const freePlan = await request.server.prisma.plan.findFirst({
        where: { name: { equals: 'free', mode: 'insensitive' } }
      });
      const pendingOrg = await request.server.prisma.organization.create({
        data: {
          name: derivedOrgName,
          slug: `pending-${Date.now()}`,
          currentPlanId: freePlan ? freePlan.id : null,
          isFreeTrialUsed: false,
        },
        include: { currentPlan: true },
      });
      await request.server.prisma.user.create({
        data: {
          email: normalizedEmail,
          emailOTP: otpCode,
          emailOtpExpiresAt: expiresAt,
          status: "pending_signup",
          orgId: pendingOrg.id,
        },
      });
      targetOrgId = pendingOrg.id;
    }

    // Send OTP email
    const emailService = request.server.emailService || require("../services/email-service");
    if (emailService && typeof emailService.sendMfaCode === "function") {
      try {
        const orgBranding = targetOrgId ? await resolveOrgBranding(request.server.prisma, targetOrgId) : null;
        await emailService.sendMfaCode(normalizedEmail, "New Member", otpCode, {
          orgLogoUrl: orgBranding?.logoUrl,
          orgName: orgBranding?.accountName,
        });
      } catch (eErr) {
        console.warn("Could not send OTP email via emailService:", eErr.message);
      }
    }

    return reply.status(200).send({
      success: true,
      message: "Verification code sent to email",
    });
  } catch (error) {
    console.error("sendSignupOtp error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to send verification code",
      details: error.message || String(error),
    });
  }
};

// Verify Signup OTP Handler
module.exports.verifySignupOtp = async (request, reply) => {
  try {
    const { email, code } = request.body || {};
    if (!email || !code) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Email and verification code are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedCode = code.trim();

    const user = await request.server.prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: "Not Found",
        message: "User not found for this email",
      });
    }

    // Verify OTP code (fallback to 123456 in dev environment for testing ease)
    const isDevFallback = process.env.NODE_ENV !== "production" && trimmedCode === "123456";
    const isValidOtp =
      isDevFallback ||
      (user.emailOTP &&
        user.emailOTP === trimmedCode &&
        user.emailOtpExpiresAt &&
        new Date() <= new Date(user.emailOtpExpiresAt));

    if (!isValidOtp) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Invalid or expired verification code",
      });
    }

    // Mark email as verified
    await request.server.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailOTP: null,
        emailOtpExpiresAt: null,
      },
    });

    return reply.status(200).send({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("verifySignupOtp error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to verify code",
      details: error.message || String(error),
    });
  }
};

// Complete Signup Handler (Saves to DB & Syncs to HubSpot)
module.exports.completeSignup = async (request, reply) => {
  try {
    const {
      email,
      firstName,
      lastName,
      name,
      password,
      workspaceName,
      companyWebsite,
      mobileNumber,
      teamSize,
      firstFocus,
      planId = "free",
      billingCycle = "annual",
      hubspotUtk,
    } = request.body || {};

    if (!email || !workspaceName) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Email and workspace name are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await request.server.prisma.user.findFirst({
      where: { email: normalizedEmail },
      include: { organization: true },
    });

    let passwordHash = null;
    if (password && typeof password === "string" && password.trim().length > 0) {
      const passwordValidation = authService.validatePassword(password);
      if (!passwordValidation.isValid) {
        return reply.status(400).send({
          success: false,
          error: "Bad Request",
          message: passwordValidation.message,
        });
      }
      passwordHash = await authService.hashPassword(password.trim());
    }

    const derivedOrgName = formatDomainToOrgName(normalizedEmail, workspaceName);
    const formattedWorkspaceName = formatWorkspaceNameWithSuffix(workspaceName);
    const slugBase = slugifyWorkspaceName(formattedWorkspaceName);
    const uniqueSlug = `${slugBase}-${Date.now()}`;

    let organization = null;
    let dbPlan = null;
    if (planId && planId !== "free") {
      dbPlan = await request.server.prisma.plan.findUnique({
        where: { id: planId },
      }).catch(() => null);
    }

    if (!dbPlan) {
      dbPlan = await request.server.prisma.plan.findFirst({
        where: { isFree: true, isActive: true },
      }).catch(() => null);
    }

    const isFreePlan = Boolean(dbPlan && dbPlan.isFree);

    const isMonthly = (billingCycle || "annual").toLowerCase() === "monthly";
    const now = new Date();
    const expiresAtDate = new Date(now);

    if (isFreePlan) {
      const trialDays = dbPlan.trialDays ?? 3;
      expiresAtDate.setDate(expiresAtDate.getDate() + trialDays);
    } else if (isMonthly) {
      expiresAtDate.setMonth(expiresAtDate.getMonth() + 1);
    } else {
      expiresAtDate.setFullYear(expiresAtDate.getFullYear() + 1);
    }

    const PRICE_TABLE = {
      free: { monthlyCents: 0, yearlyMonthlyCents: 0, yearlyTotalCents: 0 },
      basic: { monthlyCents: 1000, yearlyMonthlyCents: 900, yearlyTotalCents: 10800 },
      premium: { monthlyCents: 2500, yearlyMonthlyCents: 2300, yearlyTotalCents: 27000 },
      enterprise: { monthlyCents: 5000, yearlyMonthlyCents: 4500, yearlyTotalCents: 54000 },
    };

    const priceInfo = PRICE_TABLE[planId] || PRICE_TABLE.free;
    const subtotalCents = isMonthly ? priceInfo.monthlyCents : priceInfo.yearlyTotalCents;
    const taxCents = Math.round(subtotalCents * 0.06);
    const totalCents = subtotalCents + taxCents;

    const orgMetadata = {
      website: companyWebsite || null,
      teamSize: teamSize || null,
      primaryFocus: firstFocus || null,
      planId: dbPlan ? dbPlan.id : planId,
      billingCycle: isFreePlan ? `${dbPlan?.trialDays ?? 3}days` : (isMonthly ? "monthly" : "annual"),
      planSelectedAt: now.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      subtotalCents,
      taxCents,
      totalCents,
    };

    const orgData = {
      name: derivedOrgName,
      slug: uniqueSlug,
      currentPlanId: dbPlan ? dbPlan.id : null,
      isFreeTrialUsed: isFreePlan,
      metadata: orgMetadata,
      planExpiresAt: expiresAtDate,
    };

    if (user && user.orgId && user.status === "pending_signup") {
      organization = await request.server.prisma.organization.update({
        where: { id: user.orgId },
        data: orgData,
        include: { currentPlan: true },
      });
    } else {
      organization = await request.server.prisma.organization.create({
        data: orgData,
        include: { currentPlan: true },
      });
    }

    let superAdminRole = await request.server.prisma.role.findFirst({
      where: {
        OR: [
          { id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15" },
          { name: "Super Admin" },
          { name: "super_admin" },
          { name: "SuperAdmin" },
        ],
      },
    });
    if (!superAdminRole) {
      superAdminRole = await request.server.prisma.role.findFirst();
    }
    if (!superAdminRole) {
      superAdminRole = await request.server.prisma.role.create({
        data: {
          id: "996cc58f-8823-4b6f-bcb9-76b2c1f2dd15",
          name: "Super Admin",
          show: 0,
        },
      });
    }

    if (!superAdminRole || !superAdminRole.id) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Super Admin role ID not found. Registration cannot proceed without a valid role ID.",
      });
    }

    let finalFirstName = firstName ? String(firstName).trim() : "";
    let finalLastName = lastName ? String(lastName).trim() : "";

    if (!finalFirstName && name) {
      const parts = String(name).trim().split(" ");
      finalFirstName = parts[0];
      finalLastName = parts.slice(1).join(" ");
    }

    if (!finalFirstName) {
      const nameFromEmail = normalizedEmail.split("@")[0].replace(/[._]+/g, " ");
      const parts = nameFromEmail.split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1));
      finalFirstName = parts[0] || "User";
      finalLastName = parts.slice(1).join(" ") || "";
    }

    const computedFullName = `${finalFirstName} ${finalLastName}`.trim();

    const userPreferences = {
      teamSize: teamSize || null,
      firstFocus: firstFocus || null,
      billingCycle: billingCycle || "annual",
    };

    if (user) {
      user = await request.server.prisma.user.update({
        where: { id: user.id },
        data: {
          orgId: organization.id,
          name: computedFullName,
          ...(passwordHash ? { passwordHash } : {}),
          phone: mobileNumber || user.phone || null,
          hubspotUtk: hubspotUtk || user.hubspotUtk || null,
          roleId: superAdminRole.id,
          status: "active",
          emailVerified: true,
          preferences: userPreferences,
        },
      });
    } else {
      user = await request.server.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: computedFullName,
          passwordHash: passwordHash || null,
          orgId: organization.id,
          phone: mobileNumber || null,
          hubspotUtk: hubspotUtk || null,
          roleId: superAdminRole.id,
          status: "active",
          emailVerified: true,
          preferences: userPreferences,
        },
      });
    }

    const workspace = await request.server.prisma.workspace.create({
      data: {
        name: formattedWorkspaceName,
        description: `Workspace for ${formattedWorkspaceName}`,
        color: "#4f46e5",
        orgId: organization.id,
        visibility: 'public', // <--- Explicitly make it public
        isDefault: true,
      },
    });

    // Assign Super Admins / Admins
    await autoAssignAdminsToWorkspace(request.server.prisma, organization.id, workspace.id);

    // Automatically create default share settings for the new organization
    await ensureDefaultOrganizationSettings(request.server.prisma, organization.id);

    // --- HUBSPOT BACKGROUND SYNC ---
    syncToHubspot({
      email: normalizedEmail,
      firstName: finalFirstName,
      lastName: finalLastName,
      name: computedFullName,
      workspaceName: formattedWorkspaceName,
      companyWebsite,
      mobileNumber,
      teamSize,
      firstFocus,
      planId,
      billingCycle,
      hubspotUtk,
      referer: request.headers.referer,
      ip: request.ip,
    });

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: user.orgId,
      roleId: user.roleId,
      role: superAdminRole ? superAdminRole.name : "Super Admin",
      organization: organization,
    };
    const token = await reply.jwtSign(payload);

    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip,
      token
    );

    const authzContext = await loadUserAuthzContext(request.server.prisma, user.id);
    const userPermissions = authzContext?.permissions || [];

    user.role = superAdminRole ? superAdminRole.name : "Super Admin";

    return reply.status(200).send({
      success: true,
      message: "Signup completed successfully",
      accessToken: token,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        roleId: user.roleId,
        role: user.role,
        roleRelation: superAdminRole || { id: user.roleId, name: user.role },
        permissions: userPermissions,
        organization: formatOrganization(organization),
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
    });
  } catch (error) {
    console.error("Complete Signup Error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to complete signup",
      details: error.message || String(error),
    });
  }
};

// Logout All Active Sessions
module.exports.logoutAll = async (request, reply) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "User context not found",
      });
    }

    // Revoke all active sessions in the database for this user
    if (request.server && request.server.prisma) {
      await request.server.prisma.userSession.updateMany({
        where: {
          userId: userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return reply.status(200).send({
      success: true,
      message: "All active sessions have been successfully revoked",
    });
  } catch (error) {
    console.error("Logout All error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to revoke all sessions",
    });
  }
};

module.exports.upgradePlan = async (request, reply) => {
  try {
    const userId = request.user.id;
    const { planId = 'free', billingCycle = 'annual' } = request.body || {};

    const user = await request.server.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user || !user.orgId) {
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Organization not found for user',
      });
    }

    const normalizedPlanId = String(planId).toLowerCase().trim();
    const isRequestingFree = normalizedPlanId === 'free' || normalizedPlanId === 'f2fe83c1-d36a-4cd3-b173-7f394a77c6bd';

    if (isRequestingFree && Boolean(user.organization?.isFreeTrialUsed)) {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden',
        message: 'The Free plan trial can only be used once per organization. Please select a Basic, Premium, or Enterprise plan to upgrade.',
      });
    }

    const dbPlan = await request.server.prisma.plan.findFirst({
      where: {
        OR: [
          { id: normalizedPlanId },
          { name: { equals: normalizedPlanId, mode: 'insensitive' } },
        ],
      },
    }).catch(() => null);

    const resolvedPlanName = dbPlan ? dbPlan.name.toLowerCase() : (normalizedPlanId.length > 30 ? 'free' : normalizedPlanId);
    const isMonthly = String(billingCycle).toLowerCase() === 'monthly';

    const now = new Date();
    let expiresAtDate = new Date(now);
    if (resolvedPlanName === 'free') {
      expiresAtDate.setDate(expiresAtDate.getDate() + 3);
    } else if (isMonthly) {
      expiresAtDate.setMonth(expiresAtDate.getMonth() + 1);
    } else {
      expiresAtDate.setFullYear(expiresAtDate.getFullYear() + 1);
    }

    const updatedOrg = await request.server.prisma.organization.update({
      where: { id: user.orgId },
      data: {
        currentPlanId: dbPlan ? dbPlan.id : null,
        isFreeTrialUsed: true,
        planExpiresAt: expiresAtDate,
        metadata: {
          ...(typeof user.organization?.metadata === 'object' ? user.organization.metadata : {}),
          planId: normalizedPlanId,
          billingCycle: normalizedPlanId === 'free' ? '3days' : (isMonthly ? 'monthly' : 'annual'),
          planSelectedAt: now.toISOString(),
          expiresAt: expiresAtDate.toISOString(),
        },
      },
      include: { currentPlan: true },
    });

    return reply.send({
      success: true,
      message: `Plan updated to ${normalizedPlanId.toUpperCase()} successfully!`,
      organization: formatOrganization(updatedOrg),
    });
  } catch (error) {
    console.error('Error upgrading plan:', error);
    return reply.status(500).send({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'Failed to upgrade plan',
    });
  }
};