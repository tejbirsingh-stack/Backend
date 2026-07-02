// Authentication routes for login, registration, and session management
const { authenticate } = require("../middleware/auth-middleware");

const { login, register, logout, setupMfa, enableMfa, disableMfa, getMe, forgotPassword, resetPassword, googleLogin} = require("../controller");

async function routes(fastify, options) {
  //1. Login route
  fastify.post("/login", login);

  //2. Register route
  fastify.post("/register", register);

  //3. Logout route (requires authentication)
  fastify.post("/logout",{ preHandler: authenticate }, logout);

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

  // Google login route
  fastify.post("/loging-google", googleLogin);

}

module.exports = routes;