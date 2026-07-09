const authService = require("../services/auth-service");
const { OAuth2Client } = require('google-auth-library');
const crypto = require("crypto");


// 1. Login Handler
module.exports.login = async (request, reply) =>{
    const { email, password, mfaCode } = request.body;

    try {
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
      if (
        !user ||
        !(await authService.verifyPassword(user.passwordHash, password))
      ) {
        return reply.status(401).send({
          success: false,
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      // Check user status
      if (user.status !== "active") {
        return reply.status(403).send({
          success: false,
          error: "Forbidden",
          message: "Account is not active",
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

          return reply.status(400).send({
            success : false,
            error : "MFA Required",
            message: "An authentication code has been sent to your email",
            requiresMfa: true,
            mfaType: "email",
          });
        }

        // We have an mfaCode , verify 
        //Fetch the latest user record to get the OTP
        const currentUser = await request.server.prisma.user.findUnique({
          where: {id: user.id},
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
            emailOtpExpiresAt: null 
          }
        });
      }

      // Generate JWT token
      const payload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        organization: user.organization
      };
      const token = await reply.jwtSign(payload);
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
      organization = await request.server.prisma.organization.create({
        data: {
          name: orgName || `${name}'s Workspace`,
          slug: `${slugBase}-${Date.now()}`,
          planType: "free",
        },
      });
      finalOrgId = organization.id;
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);

    // Store user in database
    const user = await request.server.prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        orgId: finalOrgId,
        role: "super_admin", // use lowercase for consistency with backend checks
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

    // Create a session for the new user
    const session = await authService.createSession(
      user.id,
      request.headers["user-agent"],
      request.ip
    );

    return reply.status(201).send({
      message: "User registered successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        role: user.role,
        status: user.status,
        phone: user.phone,
      },
      token: session.token,
      expiresAt: session.expiresAt,
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
    const currentUserRole = request.user?.role || "";
    
    if (
      currentUserRole.toLowerCase() !== "super_admin" &&
      currentUserRole.toLowerCase() !== "superadmin"
    ) {
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
        role: roleObj.name,
        orgId: finalOrgId,
        status: "inactive",
        mfaEnabled: true, // Default to true as per existing registration logic
      },
    });

    // 7. Generate Password Setup Token
    const resetToken = await authService.createPasswordResetToken(user.id);
    const frontendUrl = process.env.FRONTEND_URL;
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
module.exports.setupMfa = async (request, reply) =>{
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
module.exports.enableMfa = async (request, reply) =>{
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
module.exports.disableMfa = async (request, reply) =>{
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

// 7. Get Me Currenlt User Info
module.exports.getMe = async (request, reply) =>{
    return {
      success: true,
      user: request.user,
    };
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

      // Send email with reset link
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      // Use the email service to send the email
      // This is a placeholder - you'll need to implement email sending
      console.log(`Password reset email for ${user.email}: ${resetUrl}`);

      // In production, you would use:
      await request.server.emailService.sendPasswordReset(user.email, user.name, resetUrl);

      return {
        success: true,
        message:
          "If an account exists for this email, a password reset link has been sent",
      };
    } catch (error) {
      console.error("Forgot password error:", error);
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

      // Return success
      return { success: true, message: "Account setup / password reset completed successfully" };
    } catch (error) {
      console.error("Reset password / account setup error:", error);
      return reply.status(500).send({
        error: "Internal Server Error",
        message: "Failed to setup account / reset password",
      });
    }
}

//10. Google Login Hander
module.exports.googleLogin = async (request, reply) => {
  const { idToken } = request.body;
  const clientId = process.env.GOOGLE_CLIENT_ID || "967923512322-0oullb620hh9se1ff0prs8stvbspi829.apps.googleusercontent.com";
  const googleClient = new OAuth2Client(clientId);

  if (!idToken) {
    return reply.status(400).send({
      success : false,
      error : "Bad Request",
      message : "Google idToken is required",
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

    // b. Extract user info from verified token
    let user = await authService.findUserByEmail(normalizedEmail);
    
    //c. Since app requires an `orgId` to register, auto-generate them  
    if(!user){
      const orgName = `${name || "User"}'s Workspace`;
      const orgSlug = `workspace-${crypto.randomBytes(4).toString("hex")}`;
      
      // Create Organization
      const organization = await request.server.prisma.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
          planType: "free"
        }
      });
      // Create User
      user = await request.server.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
          orgId: organization.id,
          role: "admin",
          status: "active",
          mfaEnabled: true // Enable MFA by default for all new users
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

    // f. Return the standard auth response
    return {
      success : true,
      user : {
       id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        organization: user.organization || null
      },
      accessToken: session.token,
      refreshToken: session.token,
      expiresAt: session.expiresAt,
    };
  } catch(error) {
    console.error("Google Login Database/Session error:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to complete Google login process",
      details: error.message
    });
  }
}

// 11. Get Roles Handler
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