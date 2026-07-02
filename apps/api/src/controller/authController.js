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

      // Find the user
      const user = await authService.findUserByEmail(email);

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
          return reply.status(400).send({
            success: false,
            error: "MFA Required",
            message: "Multi-factor authentication code is required",
            requiresMfa: true,
          });
        }

        if (!authService.verifyTotp(mfaCode, user.mfaSecret)) {
          return reply.status(401).send({
            success: false,
            error: "Unauthorized",
            message: "Invalid authentication code",
            requiresMfa: true,
          });
        }
      }

      // Create a new session
      const session = await authService.createSession(
        user.id,
        request.headers["user-agent"],
        request.ip
      );
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
          organization: user.organization
        },
        accessToken: session.token,
        refreshToken: session.token,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      console.error("Login error:", error);
      return reply.status(500).send({
        success: false,
        error: "Internal Server Error",
        message: "Failed to process login",
      });
    }
};


module.exports.register = async (request, reply) => {
  const { name, email, password, orgId, orgName, phone, jobTitle, hubspotUtk } = request.body;

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

      organization = await fastify.prisma.organization.findUnique({
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
      organization = await fastify.prisma.organization.create({
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
    const user = await fastify.prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        orgId: finalOrgId,
        role: "admin", // use lowercase for consistency with backend checks
        phone: phone || null,
        jobTitle: jobTitle || null,
        hubspotUtk: hubspotUtk || null,
        status: "active",
        failedLoginAttempts: 0,
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
      const hubspotEndpoint = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;

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
              { objectTypeId: "0-1", name: "jobtitle", value: jobTitle || "" },
            ],
            context: {
              ...(hubspotUtk && typeof hubspotUtk === "string" && hubspotUtk.trim().length > 0
                ? { hutk: hubspotUtk.trim() }
                : {}),
              pageUri: request.headers.referer || "",
              pageName: "Register Page",
              ipAddress: request.ip,
            },
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
        jobTitle: user.jobTitle,
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

// 3. Logout Handler
module.exports.logout = async (request, reply) =>{
    try {
        // Get token from the request (it's guaranteed to be valid due to the authenticate preHandler)
        const authHeader = request.headers.authorization;
        const token = authHeader.replace("Bearer ", "");

        // Revoke the session
        await authService.revokeSession(token);

        return {
          success: true,
          message: "Logged out successfully",
        };
      } catch (error) {
        console.error("Logout error:", error);
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to process logout",
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
    const { token, newPassword } = request.body;

    try {
      // Validate input
      if (!token || !newPassword) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Token and new password are required",
        });
      }

      // Verify token and get user ID
      const userId = await authService.verifyPasswordResetToken(token);

      if (!userId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid or expired token",
        });
      }

      // Get the user
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "User not found",
        });
      }

      // Hash the new password
      const passwordHash = await authService.hashPassword(newPassword);

      // Update the user's password
      await request.server.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Revoke all active sessions for security
      await authService.revokeAllUserSessions(userId);

      // Return success
      return { success: true, message: "Password successfully reset" };
    } catch (error) {
      console.error("Reset password error:", error);
      return reply.status(500).send({
        error: "Internal Server Error",
        message: "Failed to reset password",
      });
    }
}

//10. Google Login Hander
module.exports.googleLogin = async (request, reply) => {
  const { idToken } = request.body;
  const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  try{
    if (!idToken) {
      return reply.status(400).send({
        success : false,
        error : "Bad Request",
        message : "Google idToken is required",
      });
    }

    // a. Verify the access token by fetching the user's profile from Google
    const googleResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${idToken}` }
    });

    if (!googleResponse.ok) {
      throw new Error("Failed to verify token with Google");
    }

    // extract the email from the response payload
    const payload = await googleResponse.json();
    const { email, name } = payload;

    // b. Extract user info from verified token
    let user = await authService.findUserByEmail(email);
    
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
          email: email,
          name: name || email.split('@')[0],
          orgId: organization.id,
          role: "admin",
          status: "active"
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
        const fallbackName = name || email.split('@')[0];
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
              { objectTypeId: "0-1", name: "email", value: email },
              { objectTypeId: "0-1", name: "firstname", value: firstname },
              { objectTypeId: "0-1", name: "lastname", value: lastname },
              { objectTypeId: "0-1", name: "company", value: orgName },
              { objectTypeId: "0-1", name: "phone", value: "" },
              { objectTypeId: "0-1", name: "jobtitle", value: "" },
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
        organization: user.organization
      },
      accessToken: session.token,
      refreshToken: session.token,
      expiresAt: session.expiresAt,
    };
  }catch(error){
    console.error("Google Login error:", error);
    return reply.status(401).send({
      success: false,
      error: "Unauthorized",
      message: "Invalid or expired Google token",
    });
  }
}