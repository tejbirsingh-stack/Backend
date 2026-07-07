// Authentication middleware for protecting routes
const authService = require("../services/auth-service");

// Middleware to verify authentication
async function authenticate(request, reply) {
  try {
    // Get the bearer token from the Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing or invalid authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token || token === "undefined" || token === "null") {
      throw new Error("Missing or invalid authorization header");
    }

    // 1. Try verifying as JWT first
    try {
      if (typeof request.jwtVerify === "function") {
        const decoded = await request.jwtVerify();
        request.user = decoded;
        return;
      }
    } catch (jwtErr) {
      // Not a valid JWT or expired, fall through to database session check
    }

    // 2. Validate the session in database
    const session = await authService.validateSession(token);

    if (!session) {
      throw new Error("Invalid or expired session");
    }

    // Check if the user is active
    if (session.user.status !== "active") {
      throw new Error("User account is not active");
    }

    // Add user and session info to the request
    request.user = session.user;
    request.session = session;

    // Continue to the route handler
    return;
  } catch (error) {
    // Authentication failed
    reply.status(401).send({
      error: "Unauthorized",
      message: error.message || "Authentication required",
    });
    return reply;
  }
}

// Middleware to check permissions based on roles
function checkRole(roles = []) {
  // Convert string to array if only one role is provided
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (request, reply) => {
    // If no roles specified or array is empty, allow all roles
    if (!allowedRoles.length) return;

    // Make sure the user is authenticated first
    if (!request.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    // Check if user role is in allowed roles
    const { role } = request.user;
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    }

    // User has the required role
    return;
  };
}

// Export middleware functions
module.exports = {
  authenticate,
  checkRole,
};
