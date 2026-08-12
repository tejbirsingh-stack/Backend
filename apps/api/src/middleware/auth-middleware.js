// Authentication & Authorization middleware for protecting routes
const authService = require("../services/auth-service");
const { loadUserAuthzContext } = require("../lib/rbac-access");
const { isOrgWideRole, resolveUserWorkspacePermissions, resolveUserProjectPermissions } = require("../lib/rbac-policy");

async function extractResourceContext(request) {
  const prisma = request.server?.prisma;
  if (!prisma) return { type: null, id: null };

  const projectId = request.params?.projectId || request.body?.projectId || request.query?.projectId;
  if (projectId) return { type: 'project', id: projectId };

  const workspaceId = request.params?.workspaceId || request.body?.workspaceId || request.query?.workspaceId;
  if (workspaceId) return { type: 'workspace', id: workspaceId };

  const id = request.params?.id;
  const url = request.url || "";
  
  if (id) {
    if (url.includes('/projects/')) {
      return { type: 'project', id };
    } else if (url.includes('/workspaces/')) {
      return { type: 'workspace', id };
    } else if (url.includes('/folders/')) {
      const folder = await prisma.folder.findUnique({ where: { id } });
      if (folder?.workspaceId) return { type: 'workspace', id: folder.workspaceId };
    } else if (url.includes('/media/')) {
      const asset = await prisma.asset.findUnique({ where: { id } });
      if (asset?.workspaceId) return { type: 'workspace', id: asset.workspaceId };
    }
  }

  const folderId = request.params?.folderId || request.body?.folderId || request.query?.folderId;
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (folder?.workspaceId) return { type: 'workspace', id: folder.workspaceId };
  }

  const mediaId = request.params?.mediaId || request.body?.mediaId || request.query?.mediaId || request.params?.assetId || request.body?.assetId || request.query?.assetId;
  if (mediaId) {
    const asset = await prisma.asset.findUnique({ where: { id: mediaId } });
    if (asset?.workspaceId) return { type: 'workspace', id: asset.workspaceId };
  }

  return { type: null, id: null };
}

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

    let permissions = request.user.permissions || [];
    const context = await extractResourceContext(request);

    if (context.type === 'project' && request.server?.prisma) {
      const project = await request.server.prisma.project.findUnique({ where: { id: context.id }, include: { workspace: true } });
      if (project) {
        permissions = await resolveUserProjectPermissions(request.server.prisma, request.user, project);
      }
    } else if (context.type === 'workspace' && request.server?.prisma) {
      const workspace = await request.server.prisma.workspace.findUnique({ where: { id: context.id } });
      if (workspace) {
        permissions = await resolveUserWorkspacePermissions(request.server.prisma, request.user, workspace);
      }
    }

    if (!permissions.includes(slug)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: `Missing required permission: ${slug} in this resource context`,
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

    let permissions = request.user.permissions || [];
    const context = await extractResourceContext(request);

    if (context.type === 'project' && request.server?.prisma) {
      const project = await request.server.prisma.project.findUnique({ where: { id: context.id }, include: { workspace: true } });
      if (project) {
        permissions = await resolveUserProjectPermissions(request.server.prisma, request.user, project);
      }
    } else if (context.type === 'workspace' && request.server?.prisma) {
      const workspace = await request.server.prisma.workspace.findUnique({ where: { id: context.id } });
      if (workspace) {
        permissions = await resolveUserWorkspacePermissions(request.server.prisma, request.user, workspace);
      }
    }

    const hasAny = slugs.some((slug) => permissions.includes(slug));

    if (!hasAny) {
      return reply.status(403).send({
        error: "Forbidden",
        message: `Missing required permissions: one of ${slugs.join(", ")} in this resource context`,
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
