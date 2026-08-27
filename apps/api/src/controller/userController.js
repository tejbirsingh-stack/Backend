// User and Team Management Controller
const { roles } = require('../lib');
const { autoAssignNewAdminToWorkspaces } = require('../services/workspace.service');
const path = require('path');
const B2StorageService = require("../b2-storage.cjs");

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

// 1. Get all users belonging to the logged-in user's organization (orgId)
module.exports.getUsers = async (request, reply) => {
  try {
    if (!request.user || !request.user.id) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Authentication required to fetch users",
      });
    }

    // Get the orgId from the token payload or from the database if not in payload
    let orgId = request.user.orgId;
    if (!orgId) {
      const currentUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { orgId: true },
      });
      orgId = currentUser?.orgId;
    }

    if (!orgId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Logged-in user is not associated with any organization",
      });
    }

    // Fetch all users belonging to this orgId
    const users = await request.server.prisma.user.findMany({
      where: {
        orgId: orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        jobTitle: true,
        phone: true,
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
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const formattedUsers = users.map(u => ({
      ...u,
      role: (u.roleRelation && u.roleRelation.name) ? u.roleRelation.name : u.role,
    }));

    return reply.send({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching organization users:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch organization users",
      details: error.message || String(error),
    });
  }
};

// 2. Get single user details
module.exports.getSingleUser = async (request, reply) => {
  return reply.send({
    message: `User ${request.params.id} endpoint not yet implemented`,
  });
};

// 3. Create user
module.exports.createUser = async (request, reply) => {
  return reply.send({ message: "User creation endpoint not yet implemented" });
};


module.exports.userAcitivites = async (request, reply) => {
  try {
    if (!request.user || !request.user.id) {
      return reply.status(401).send({
        success: false,
        error: "Unauthorized",
        message: "Authentication required to fetch user activities",
      });
    }

    // Get the orgId from the token payload or from the database if not in payload
    let orgId = request.user.orgId;
    if (!orgId) {
      const currentUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { orgId: true },
      });
      orgId = currentUser?.orgId;
    }

    if (!orgId) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Logged-in user is not associated with any organization",
      });
    }

    // Fetch all activities for this organization
    const activities = await request.server.prisma.AuditLog.findMany({
      where: {
        orgId: orgId,
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return reply.send({
      success: true,
      count: activities.length,
      activities: activities,
    });
  } catch (error) {
    console.error("Error fetching user activities:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch user activities",
      details: error.message || String(error),
    });
  }
}

module.exports.getRoles = async (request, reply) => {
  try {
    const Roles = await request.server.prisma.role.findMany({
      where: {
        name: {
          not: roles.PLATFORM_ADMIN
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return reply.send({
      success: true,
      roles: Roles
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch roles",
      details: error.message || String(error),
    });
  }
};

module.exports.updateProfile = async (request, reply) => {
  try {
    const { name, timezone, shareLinkActivityEnabled, preferences } = request.body;

    if (!request.user || !request.user.id) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    let updateData = {};
    if (name !== undefined) updateData.name = name;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (shareLinkActivityEnabled !== undefined) updateData.shareLinkActivityEnabled = shareLinkActivityEnabled;

    if (preferences !== undefined) {
      const existingUser = await request.server.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { preferences: true }
      });
      const currentPrefs = existingUser?.preferences && typeof existingUser.preferences === 'object'
        ? existingUser.preferences
        : {};
      updateData.preferences = {
        ...currentPrefs,
        ...preferences
      };
    }

    const updatedUser = await request.server.prisma.user.update({
      where: { id: request.user.id },
      data: updateData
    });

    return reply.send({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to update profile", message: error.message });
  }
};

module.exports.uploadProfilePhoto = async (request, reply) => {
  try {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    if (!request.user || !request.user.id) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const userId = request.user.id;
    let orgId = request.user.orgId;

    const user = await request.server.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true }
    });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    orgId = orgId || user.orgId;
    if (!orgId || !user.organization) {
      return reply.code(400).send({ error: "User is not associated with an organization" });
    }

    // Sanitize organization name and email for B2 key
    const sanitizedOrgName = user.organization.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const sanitizedEmail = user.email.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const folderName = `${sanitizedEmail}_${userId}`;

    const ext = path.extname(data.filename) || '.png';
    const uniqueFilename = `profile_${Date.now()}${ext}`;

    // Path: noah-uploads / [organization name] / Profile Photo / [Username_emailid_uniqueid] / [filename]
    const b2Key = `noah-uploads/${sanitizedOrgName}/Profile Photo/${folderName}/${uniqueFilename}`;

    // Upload to B2
    const uploadedAsset = await b2Storage.uploadStream(
      data.file,
      b2Key,
      data.mimetype,
      { type: 'profile_photo', userId: userId }
    );

    // If the user already had an avatar, permanently delete the old one from B2 to save space
    if (user.avatarKey && user.avatarKey !== uploadedAsset.key) {
      try {
        await b2Storage.permanentlyDeleteFile(user.avatarKey);
      } catch (delErr) {
        request.log.warn(`Failed to delete old avatar ${user.avatarKey}: ${delErr.message}`);
      }
    }

    // Internal dynamic URL that redirects to the latest presigned B2 URL with cache-busting
    const internalAvatarUrl = `/api/users/${userId}/avatar?t=${Date.now()}`;

    // Update User model with avatar details
    const updatedUser = await request.server.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: internalAvatarUrl,
        avatarKey: uploadedAsset.key
      }
    });

    return reply.send({
      success: true,
      avatarUrl: internalAvatarUrl,
      avatarKey: uploadedAsset.key,
      user: updatedUser
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to upload profile photo", message: error.message });
  }
};

module.exports.getAvatar = async (request, reply) => {
  try {
    const { id } = request.params;

    const user = await request.server.prisma.user.findUnique({
      where: { id },
      select: { avatarKey: true, avatarUrl: true }
    });

    if (!user || (!user.avatarKey && !user.avatarUrl)) {
      return reply.code(404).send({ error: "Avatar not found" });
    }

    // If we have an avatar key, generate a fresh presigned URL
    if (user.avatarKey) {
      if (b2Storage.isEnabled()) {
        const presignedUrl = await b2Storage.getPresignedUrl(user.avatarKey, 3600);
        if (presignedUrl) {
          // Temporarily redirect to the fresh B2 presigned URL
          return reply.redirect(presignedUrl, 302);
        }
      }
    } else if (user.avatarUrl && user.avatarUrl.startsWith('http')) {
      // Fallback for legacy external URLs
      return reply.redirect(user.avatarUrl, 302);
    }

    return reply.code(404).send({ error: "Avatar storage unavailable" });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to fetch avatar", details: error.message, stack: error.stack });
  }
};


module.exports.updateUserAdmin = async (request, reply) => {
  try {
    const { id } = request.params;
    const { email, roleId } = request.body;

    // 1. Verify Super Admin role
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
        message: "Access denied. Only Super Admin or Admin can edit users.",
      });
    }

    if (!id || (!email && !roleId)) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "User ID, and at least one of email or role are required.",
      });
    }

    const targetUser = await request.server.prisma.user.findUnique({
      where: { id },
      include: { roleRelation: true }
    });

    if (!targetUser) {
      return reply.status(404).send({ success: false, error: "Not Found", message: "User not found" });
    }

    const previousRoleName = targetUser.roleRelation?.name || targetUser.role || "";

    const dataToUpdate = {
      status: "active"
    };

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const existingUser = await request.server.prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser && existingUser.id !== id) {
        return reply.status(409).send({
          success: false,
          error: "Conflict",
          message: "Email is already in use by another user",
        });
      }
      dataToUpdate.email = normalizedEmail;
    }

    if (roleId) {
      // Find role by ID or Name
      const targetRole = await request.server.prisma.role.findFirst({
        where: {
          OR: [
            { id: roleId },
            { name: roleId }
          ]
        }
      });
      if (!targetRole) {
        return reply.status(400).send({ success: false, error: "Bad Request", message: "Role not found" });
      }
      dataToUpdate.roleRelation = {
        connect: { id: targetRole.id }
      };
    }

    const updatedUser = await request.server.prisma.user.update({
      where: { id },
      data: dataToUpdate,
      include: {
        roleRelation: true
      }
    });

    const updatedRoleName = updatedUser.roleRelation?.name || "";

    if (roleId && ['Super Admin', 'Admin', 'Platform Admin'].includes(updatedRoleName)) {
      if (updatedUser.orgId) {
        await autoAssignNewAdminToWorkspaces(request.server.prisma, updatedUser.orgId, updatedUser.id);
      }
    }

    // Send email notification if role changed
    if (roleId && updatedRoleName && updatedRoleName !== previousRoleName) {
      try {
        const emailService = request.server?.emailService || require("../services/email-service");
        if (emailService) {
          if (typeof emailService.sendRoleUpdateNotification === 'function') {
            await emailService.sendRoleUpdateNotification(updatedUser.email, {
              userName: updatedUser.name || updatedUser.email,
              oldRole: previousRoleName,
              newRole: updatedRoleName,
            });
          } else if (typeof emailService.sendEmail === 'function') {
            await emailService.sendEmail({
              to: updatedUser.email,
              subject: `Your role on Noah has been updated to ${updatedRoleName}`,
              text: `Hi,\n\nYour account role has been updated from "${previousRoleName}" to "${updatedRoleName}".\n\nThanks,\nNoah Team`,
              html: `<div style="font-family: Arial, sans-serif; padding: 24px;"><h2 style="color: #4f46e5;">Role Updated</h2><p>Your account role on Noah has been updated to <strong>${updatedRoleName}</strong>.</p></div>`,
            });
          }
        }
      } catch (emailErr) {
        request.log.error(`Failed to send role update notification email: ${emailErr.message}`);
      }
    }

    const formattedUser = {
      ...updatedUser,
      role: updatedRoleName
    };

    return reply.send({
      success: true,
      user: formattedUser
    });

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: "Failed to update user", message: error.message });
  }
};
module.exports.bulkUpdateUsersAdmin = async (request, reply) => {
  try {
    const { userIds, action } = request.body; // action: 'active', 'inactive', 'delete'

    // 1. Verify Super Admin or Admin role
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
        message: "Access denied. Admin permissions required.",
      });
    }

    if (!Array.isArray(userIds) || userIds.length === 0 || !['active', 'inactive', 'delete'].includes(action)) {
      return reply.status(400).send({
        success: false,
        error: "Bad Request",
        message: "Valid userIds array and action ('active', 'inactive', 'delete') are required.",
      });
    }

    if (action === 'delete') {
      // Super Admin or Admin can delete users
      if (normalizedRole !== "superadmin" && normalizedRole !== "admin") {
        return reply.status(403).send({
          success: false,
          error: "Forbidden",
          message: "Access denied. Only Super Admin or Admin can delete users.",
        });
      }

      // Fetch target users to prevent deleting self or other Super Admins
      const targetUsers = await request.server.prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { roleRelation: true }
      });

      const safeUserIdsToDelete = targetUsers
        .filter((u) => {
          if (u.id === request.user.id) return false; // Prevent self deletion
          const rName = (u.roleRelation?.name || u.role || '').toLowerCase().replace(/[_ -]+/g, "");
          if (rName === 'superadmin') return false; // Prevent Super Admin deletion
          return true;
        })
        .map((u) => u.id);

      if (safeUserIdsToDelete.length === 0) {
        return reply.status(400).send({
          success: false,
          error: "Bad Request",
          message: "Super Admin and your own account cannot be deleted.",
        });
      }

      await request.server.prisma.user.deleteMany({
        where: { id: { in: safeUserIdsToDelete } }
      });

      return reply.send({
        success: true,
        message: `Successfully deleted ${safeUserIdsToDelete.length} user(s)`
      });
    } else {
      await request.server.prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: action === 'active' ? 'active' : (action === 'inactive' ? 'inactive' : action) }
      });

      return reply.send({
        success: true,
        message: `Successfully updated ${userIds.length} user(s)`
      });
    }

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      error: "Internal Server Error",
      message: "Failed to perform bulk update on users",
    });
  }
};
