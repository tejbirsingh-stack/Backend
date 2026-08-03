
const authService = require("../services/auth-service");
const { OAuth2Client } = require('google-auth-library');
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { logSuccess, logError, ACTIVITY_NAME } = require("../lib/audit-log");

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
        await request.server.emailService.sendMfaCode(user.email, user.name || "User", otpCode);
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

    // Generate JWT token
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: user.orgId,
      roleId: user.roleId,
      role: user.role || (user.roleRelation ? user.roleRelation.name : null),
      roleRelation: user.roleRelation,
      organization: user.organization
    };
    const token = await reply.jwtSign(payload);
    logSuccess(ACTIVITY_NAME.USER_LOGIN, "Login successful.", null, user);  //Log user activity


    return {
      success: true,
      accessToken: token
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
  const { name, email, password, orgId, orgName, phone, hubspotUtk } = request.body;

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
      const derivedOrgName = formatDomainToOrgName(email, orgName || `${name}'s Workspace`);
      organization = await request.server.prisma.organization.create({
        data: {
          name: derivedOrgName,
          slug: `${slugBase}-${Date.now()}`,
          planType: "free",
        },
      });
      finalOrgId = organization.id;

      //get first name from name
      const firstName = name.trim().split(/\s+/)[0];

      // Automatically create a default workspace for the new organization
      await request.server.prisma.workspace.create({
        data: {
          name: `${firstName}-Workspace`,
          description: "Default workspace for " + name,
          color: "#4f46e5",
          orgId: finalOrgId,
        }
      });
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
      await emailService.sendEmailVerification(user.email, user.name || "User", verificationUrl);
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

    if (normalizedRole !== "superadmin") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Access denied. Only Super Admin can register new users with roles.",
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
    });
    if (!organization) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Invalid organization ID: Organization not found",
      });
    }



    // 5. Fetch role from Roles table where id = roleId
    const roleObj = await request.server.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!roleObj) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Invalid role ID: Role not found in roles table",
      });
    }

    // 6. Save ONLY email, roleId, role name, and orgId to the database
    const user = await request.server.prisma.user.create({
      data: {
        email: normalizedEmail,
        roleId: roleId,
        orgId: finalOrgId,
        status: "inactive",
        mfaEnabled: true, // Default to true as per existing registration logic
      },
    });
    user.role = roleObj.name;

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
        mfaEnabled: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
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

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: "Not Found",
        message: "User not found",
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

    return {
      success: true,
      user: user,
    };
  } catch (error) {
    console.error("Get me error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch current user profile",
    });
  }
};

// 8. Forgot Password Handler
module.exports.forgotPassword = async (request, reply) => {
  const { email } = request.body;

  try {
    // Validate input
    if (!email) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Email is required",
      });
    }

    // Find the user
    const user = await authService.findUserByEmail(email);

    // If user doesn't exist, still return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        message:
          "If an account exists for this email, a password reset link has been sent",
      };
    }

    // Check user status
    if (user.status !== "active") {
      return {
        success: true,
        message:
          "If an account exists for this email, a password reset link has been sent",
      };
    }

    // Generate token
    const resetToken = await authService.createPasswordResetToken(user.id);

    const frontendUrl = request.headers.origin || process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://qa.noahcloud.ai" : "http://localhost:5173");
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Use the email service to send the email
    // This is a placeholder - you'll need to implement email sending
    console.log(`Password reset email for ${user.email}: ${resetUrl}`);

    // In production, you would use:
    await request.server.emailService.sendPasswordReset(user.email, user.name, resetUrl);

    logSuccess(ACTIVITY_NAME.FORGOT_PASSWORD, "Password reset link requested.", null, user);

    return {
      success: true,
      message:
        "If an account exists for this email, a password reset link has been sent",
    };
  } catch (error) {
    console.error("Forgot password error:", error);
    logError("FORGOT PASSWORD", "Password reset link request failed.", request, error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to process password reset request",
    });
  }
}

// 9. Reset Password Handle
module.exports.resetPassword = async (request, reply) => {
  const { token, newPassword, password, name } = request.body || {};
  const finalPassword = newPassword || password;

  try {
    // Validate input
    if (!token || !finalPassword) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Token and password are required",
      });
    }

    // Verify token and get user ID
    const userId = await authService.verifyPasswordResetToken(token);

    if (!userId) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid or expired setup/reset token",
      });
    }

    // Get the user with organization details
    const user = await request.server.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "User not found",
      });
    }

    // Hash the new password
    const passwordHash = await authService.hashPassword(finalPassword);

    // Prepare update data: update password, activate status, and set name if provided
    const updateData = {
      passwordHash,
      status: "active",
    };
    if (name && typeof name === "string" && name.trim().length > 0) {
      updateData.name = name.trim();
    }

    // Update the user's account in database
    const updatedUser = await request.server.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { organization: true },
    });

    // Revoke all active sessions for security upon password change
    await authService.revokeAllUserSessions(userId);

    // --- HUBSPOT BACKGROUND SYNC BLOCK ---
    const portalId = process.env.HUBSPOT_PORTAL_ID?.trim();
    const formId = process.env.HUBSPOT_FORM_ID?.trim();
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN?.trim();

    //get first name from name
    const firstName = name.trim().split(/\s+/)[0];

    // Automatically create a default workspace for the new organization
    await request.server.prisma.workspace.create({
      data: {
        name: `${firstName}-Workspace`,
        description: "Default workspace for " + name,
        color: "#4f46e5",
        orgId: updatedUser?.orgId,
      }
    });

    if (portalId && formId) {
      const userName = updatedUser.name || updatedUser.email.split('@')[0];
      const [firstname, ...lastnameParts] = userName.split(" ");
      const lastname = lastnameParts.join(" ") || "";
      const hubspotEndpoint = `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formId}`;

      const headers = { "Content-Type": "application/json" };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      if (typeof fetch !== 'undefined') {
        fetch(hubspotEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: [
              { objectTypeId: "0-1", name: "email", value: updatedUser.email },
              { objectTypeId: "0-1", name: "firstname", value: firstname },
              { objectTypeId: "0-1", name: "lastname", value: lastname },
              { objectTypeId: "0-1", name: "company", value: updatedUser.organization ? updatedUser.organization.name : "" },
              { objectTypeId: "0-1", name: "phone", value: updatedUser.phone || "" },
            ],
            context: {
              pageUri: request.headers.referer || "",
              pageName: "Account Setup / Password Reset Page",
              ipAddress: request.ip,
            },
            skipValidation: true,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errText = await res.text();
              console.error("HubSpot Form submit failed response (resetPassword):", errText);
            } else {
              console.log("Successfully synced setup/resetPassword to HubSpot Form");
            }
          })
          .catch((err) => {
            console.error("HubSpot Form API Connection error (resetPassword):", err.message);
          });
      }
    }

    logSuccess(ACTIVITY_NAME.RESET_PASSWORD, "Password reset successfully.", null, updatedUser);

    // Return success
    return { success: true, message: "Account setup / password reset completed successfully" };
  } catch (error) {
    console.error("Reset password / account setup error:", error);
    logError(ACTIVITY_NAME.RESET_PASSWORD, "Password reset failed.", request, error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Failed to setup account / reset password",
    });
  }
}

//10. Google Login Hander
module.exports.googleLogin = async (request, reply) => {
  const { idToken } = request.body || {};
  const clientId = process.env.GOOGLE_CLIENT_ID || "967923512322-0oullb620hh9se1ff0prs8stvbspi829.apps.googleusercontent.com";
  const googleClient = new OAuth2Client(clientId);

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

    //c. Since app requires an `orgId` to register, auto-generate them  
    if (!user) {
      const orgName = formatDomainToOrgName(normalizedEmail, `${name || "User"}'s Workspace`);
      const orgSlug = `workspace-${crypto.randomBytes(4).toString("hex")}`;

      // Create Organization
      const organization = await request.server.prisma.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
          planType: "free"
        }
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
      await request.server.prisma.workspace.create({
        data: {
          name: `${firstName}-Workspace`,
          description: "Default workspace for " + fullName,
          color: "#4f46e5",
          orgId: organization.id,
        }
      });

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

    // e. Create a session exactly how normal login does
    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip
    );

    // Generate Internal JWT
    const internalPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      organization: user.organization
    };
    const internalToken = await reply.jwtSign(internalPayload);

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

    if (!user) {
      // Auto-generate a new Organization if they are a new user
      const slugBase = email.split("@")[0].replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const orgName = formatDomainToOrgName(email, `${name}'s Workspace`);

      const organization = await request.server.prisma.organization.create({
        data: {
          name: orgName,
          slug: `${slugBase}-${Date.now()}`,
          planType: "free",
        },
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
      await request.server.prisma.workspace.create({
        data: {
          name: `${firstName}-Workspace`,
          description: "Default workspace for " + name,
          color: "#4f46e5",
          orgId: organization.id,
        }
      });

      // Automatically create a default workspace for the new organization
      await request.server.prisma.workspace.create({
        data: {
          name: orgName + " Workspace",
          description: "Default workspace for " + orgName,
          color: "#4f46e5",
          orgId: organization.id,
        }
      });
    }

    if (user.status !== "active") {
      return reply.status(403).send({
        success: false,
        error: "Forbidden",
        message: "Account is not active",
      });
    }

    // 5. Create Session
    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip
    );

    // 6. Generate Internal JWT
    const internalPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      organization: user.organization
    };
    const internalToken = await reply.jwtSign(internalPayload);

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