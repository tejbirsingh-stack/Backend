// Authentication routes for login, registration, and session management
const { authenticate } = require("../middleware/auth-middleware");
const authController = require("../controller/authController");
const userController = require("../controller/userController");

async function routes(fastify, options) {
  // New Onboarding Signup routes
  if (authController.checkEmail) fastify.post("/check-email", authController.checkEmail);
  if (authController.sendSignupOtp) fastify.post("/send-signup-otp", authController.sendSignupOtp);
  if (authController.verifySignupOtp) fastify.post("/verify-signup-otp", authController.verifySignupOtp);
  if (authController.completeSignup) fastify.post("/complete-signup", authController.completeSignup);

  //1. Login route
  if (authController.login) fastify.post("/login", authController.login);

  //2. Register route
  if (authController.register) fastify.post("/register", authController.register);

  //3. Logout route
  if (authController.logout) fastify.post("/logout", authController.logout);

  // Logout All Sessions
  if (authController.logoutAll) fastify.post("/logout-all", { preHandler: authenticate }, authController.logoutAll);

  if (authController.registerRole) fastify.post("/registerrole", { preHandler: authenticate }, authController.registerRole);

  if (userController.getRoles) fastify.get("/roles", { preHandler: authenticate }, userController.getRoles);

  if (userController.getUsers) fastify.get("/users", { preHandler: authenticate }, userController.getUsers);

  //4. Setup MFA route (requires authentication)
  if (authController.setupMfa) fastify.post("/mfa/setup", { preHandler: authenticate }, authController.setupMfa);

  //5. Verify and enable MFA route (requires authentication)
  if (authController.enableMfa) fastify.post("/mfa/enable", { preHandler: authenticate }, authController.enableMfa);

  //6. Disable MFA route (requires authentication)
  if (authController.disableMfa) fastify.post("/mfa/disable", { preHandler: authenticate }, authController.disableMfa);

  //7. Get current user info (requires authentication)
  if (authController.getMe) fastify.get("/me", { preHandler: authenticate }, authController.getMe);

  //8. Forgot password route
  if (authController.forgotPassword) fastify.post("/forgot-password", authController.forgotPassword);

  //9. Reset password route
  if (authController.resetPassword) fastify.post("/reset-password", authController.resetPassword);

  //10 Google login route
  if (authController.googleLogin) {
    fastify.post("/loging-google", authController.googleLogin);
    fastify.post("/login-google", authController.googleLogin);
    fastify.post("/google-login", authController.googleLogin);
  }

  //11. Microsoft login route
  if (authController.microsoftLogin) {
    fastify.post("/login-microsoft", authController.microsoftLogin);
    fastify.post("/microsoft-login", authController.microsoftLogin);
  }

  //12. Verify email routes
  if (authController.verifyEmail) {
    fastify.post("/verify-email", authController.verifyEmail);
    fastify.get("/verify-email", authController.verifyEmail);
  }
}

module.exports = routes;