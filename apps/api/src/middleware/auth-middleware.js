// Authentication & Authorization middleware for protecting routes
const authService = require("../services/auth-service");
const { loadUserAuthzContext } = require("../lib/rbac-access");
const { isOrgWideRole } = require("../lib/rbac-policy");

// Middleware to verify authentication
async function authenticate(request, reply) {
  try {
    let token = null;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (request.query && (request.query.token || request.query.streamToken || request.query.t)) {
      token = request.query.token || request.query.streamToken || request.query.t;
    }

    if (!token || token === "undefined" || token === "null") {
      throw new Error("Missing or invalid authorization header");
    }

    // 1. Try verifying as JWT first
    try {
      if (typeof request.jwtVerify === "function") {
        const decoded = await request.jwtVerify();
        if (decoded && request.server && request.server.prisma) {
          const revokedCheck = await request.server.prisma.userSession.findFirst({
            where: {
              token: token,
              revokedAt: { not: null },
            },
          });
          if (revokedCheck) {
            throw new Error("Token has been revoked or expired");
          }

          if (decoded.id) {
            const authz = await loadUserAuthzContext(request.server.prisma, decoded.id);
            if (!authz) {
              throw new Error("User account no longer exists or is inactive");
            }
            decoded.permissions = authz.permissions;
            decoded.allowedProjectIds = authz.allowedProjectIds;
            decoded.role = authz.role || decoded.role;
            decoded.orgId = authz.orgId || decoded.orgId;
            decoded.isOrgWide = authz.isOrgWide;

            request.server.prisma.user
              .update({
                where: { id: decoded.id },
                data: { lastActiveAt: new Date() },
              })
              .catch((err) => console.error("Error updating user lastActiveAt:", err.message));
          }
        }
        request.user = decoded;
        return;
      }
    } catch (jwtErr) {
      // Fall through to database session check
    }

    // 2. Validate session in database
    const session = await authService.validateSession(token);
    if (!session) {
      throw new Error("Invalid or expired session");
    }

    if (session.user.status !== "active") {
      throw new Error("User account is not active");
    }

    request.user = session.user;
    request.session = session;
    return;
  } catch (error) {
    reply.status(401).send({
      error: "Unauthorized",
      message: error.message || "Authentication required",
    });
    return reply;
  }
}

// Check role by role name list
function checkRole(roles = []) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (request, reply) => {
    if (!allowedRoles.length) return;

    if (!request.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    const { role } = request.user;
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    }
    return;
  };
}

// Require a specific granular permission slug
function requirePermission(slug) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    const permissions = request.user.permissions || [];
    if (!permissions.includes(slug)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: `Missing required permission: ${slug}`,
        code: "RBAC_DENIED",
        requiredPermission: slug,
      });
    }
  };
}

// Require ANY of the given permission slugs
function requireAnyPermission(slugs = []) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    const permissions = request.user.permissions || [];
    const hasAny = slugs.some((slug) => permissions.includes(slug));

    if (!hasAny) {
      return reply.status(403).send({
        error: "Forbidden",
        message: `Missing required permissions: one of ${slugs.join(", ")}`,
        code: "RBAC_DENIED",
        requiredPermissions: slugs,
      });
    }
  };
}

// Guard requiring explicit project-level tenancy access
function requireProjectAccess(options = {}) {
  const paramName = options.paramName || "projectId";

  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    const isOrgWide = isOrgWideRole(request.user.role || request.user.roleId);
    if (isOrgWide) return;

    const projectId =
      request.params?.[paramName] ||
      request.body?.[paramName] ||
      request.query?.[paramName];

    if (!projectId) return;

    const allowedProjectIds = request.user.allowedProjectIds || [];
    if (!allowedProjectIds.includes(projectId)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "You do not have access to this project",
        code: "TENANT_DENIED",
      });
    }
  };
}

module.exports = {
  authenticate,
  checkRole,
  requirePermission,
  requireAnyPermission,
  requireProjectAccess,
};
