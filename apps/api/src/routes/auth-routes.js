// Authentication routes for login, registration, and session management
const { authenticate } = require("../middleware/auth-middleware");

const { login, register, logout, setupMfa, enableMfa, disableMfa, getMe, forgotPassword, resetPassword, googleLogin, microsoftLogin, registerRole, getRoles, getUsers, verifyEmail, sendSignupOtp, verifySignupOtp, completeSignup, checkEmail } = require("../controller");

async function routes(fastify, options) {
  // New Onboarding Signup routes
  fastify.post("/check-email", checkEmail);
  fastify.post("/send-signup-otp", sendSignupOtp);
  fastify.post("/verify-signup-otp", verifySignupOtp);
  fastify.post("/complete-signup", completeSignup);

  //1. Login route
  fastify.post("/login", login);

  //2. Register route
  fastify.post("/register", register);

  //3. Logout route
  fastify.post("/logout", logout);

  fastify.post("/registerrole", { preHandler: authenticate }, registerRole);

  fastify.get("/roles", { preHandler: authenticate }, getRoles);

  fastify.get("/users", { preHandler: authenticate }, getUsers);

  //4. Setup MFA route (requires authentication)
  fastify.post("/mfa/setup",{ preHandler: authenticate }, setupMfa);

  //5. Verify and enable MFA route (requires authentication)
  fastify.post("/mfa/enable",{ preHandler: authenticate }, enableMfa);

  //6. Disable MFA route (requires authentication)
  fastify.post("/mfa/disable", { preHandler: authenticate }, disableMfa);

  //7. Get current user info (requires authentication)
  fastify.get("/me", { preHandler: authenticate }, getMe);

  //8. Forgot password route
  fastify.post("/forgot-password", forgotPassword);

  //9. Reset password route
  fastify.post("/reset-password",resetPassword);

  //10 Google login route
  fastify.post("/loging-google", googleLogin);
  fastify.post("/login-google", googleLogin);

  //11. Microsoft login route
  fastify.post("/login-microsoft", microsoftLogin);
  fastify.post("/microsoft-login", microsoftLogin);

  //12. Verify email routes
  fastify.post("/verify-email", verifyEmail);
  fastify.get("/verify-email", verifyEmail);
}

module.exports = routes;