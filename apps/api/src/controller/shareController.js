const crypto = require('crypto');
const argon2 = require('argon2');
const path = require('path');
const fs = require('fs');
const { handleMediaRedirectOrServe } = require('./mediaController');
const { broadcastToRoom } = require('./realtimeController');
const { resolveOrgBranding } = require('../services/branding.service');
const { createNotification } = require('./notificationController');
const B2StorageService = require('../b2-storage.cjs');
const { getB2Storage } = require('../services/b2Config');

/** Lazily-resolved B2 storage (creds from .env in dev, AWS Secrets Manager in all other envs) */
async function b2() { return getB2Storage(B2StorageService); }


/**
 * Helper to compute expiresAt DateTime
 */
function calculateExpiry(expiresInDays, customExpiresAt) {
  if (customExpiresAt) {
    const d = new Date(customExpiresAt);
    if (!isNaN(d.getTime())) return d;
  }
  const days = parseInt(expiresInDays, 10) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Helper to generate random 32-character hex token
 */
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Owner API: POST /api/media/:id/share
 * Creates a share link or email invite for a media asset
 */
async function createShareLink(req, reply) {
  const { prisma, emailService } = req.server;
  const assetId = req.params.id;
  const user = req.user;

  const {
    mode = 'email',
    email,
    password,
    name,
    visibility = 'public',
    expiresInDays,
    expiresAt: customExpiresAt,
    permissions,
  } = req.body || {};

  try {
    // 1. Verify asset belongs to user's org
    const asset = await prisma.asset.findFirst({
      where: { id: assetId },
    });

    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }

    const orgId = user.orgId || asset.orgId;

    // Fetch org settings to apply defaults
    const { ensureDefaultOrganizationSettings } = require('../services/organization.service');
    const orgSettings = await ensureDefaultOrganizationSettings(prisma, orgId);

    // 1. strictly enforce Expiry Days from orgSettings
    let finalExpiresInDays = expiresInDays;
    let finalCustomExpiresAt = customExpiresAt;

    if (orgSettings.defaultExpiryDays) {
      finalExpiresInDays = orgSettings.defaultExpiryDays;
      finalCustomExpiresAt = undefined; // Force use of days if org setting exists
    } else if (finalExpiresInDays === undefined && !finalCustomExpiresAt) {
      finalExpiresInDays = 30; // ultimate fallback
    }
    const expiresAt = calculateExpiry(finalExpiresInDays, finalCustomExpiresAt);

    // 2. strictly enforce permissions from orgSettings
    let defaultComment = false;
    let defaultDownload = true;
    let defaultDownloadProxy = true;
    let defaultWatermark = true;

    if (orgSettings.allowCommentsDefault !== undefined) {
      defaultComment = orgSettings.allowCommentsDefault;
    }
    if (orgSettings.allowDownloadOriginalDefault !== undefined) {
      defaultDownload = orgSettings.allowDownloadOriginalDefault;
    }
    if (orgSettings.allowDownloadProxyDefault !== undefined) {
      defaultDownloadProxy = orgSettings.allowDownloadProxyDefault;
    }
    if (orgSettings.showCompanyWatermarkDefault !== undefined) {
      defaultWatermark = orgSettings.showCompanyWatermarkDefault;
    }

    // Merge: user-provided permissions take priority; org defaults are used as fallback only
    const finalPermissions = {
      view: true,
      comment: permissions?.comment !== undefined ? Boolean(permissions.comment) : defaultComment,
      download: permissions?.download !== undefined ? Boolean(permissions.download) : defaultDownload,
      downloadProxy: permissions?.downloadProxy !== undefined ? Boolean(permissions.downloadProxy) : defaultDownloadProxy,
      watermark: permissions?.watermark !== undefined ? Boolean(permissions.watermark) : defaultWatermark,
    };

    // 3. Password requirement handling (Public links never require passwords; passwords are only for private shares)
    let passwordHash = null;
    let finalPassword = null;

    if (visibility !== 'public') {
      if (password && typeof password === 'string' && password.trim().length > 0) {
        finalPassword = password.trim();
      } else if (orgSettings.requirePasswordDefault) {
        finalPassword = crypto.randomBytes(4).toString('hex'); // auto-generate if missing and org requires password
      }
    }

    if (finalPassword) {
      passwordHash = await argon2.hash(finalPassword);
    } else {
      passwordHash = null;
    }

    const mainToken = generateToken();

    const createdUserId = user?.id || user?.userId;
    const existingUser = createdUserId
      ? await prisma.user.findFirst({ where: { id: createdUserId } })
      : null;

    // 3. Create ShareLink in DB
    const shareLink = await prisma.shareLink.create({
      data: {
        orgId,
        assetId,
        token: mainToken,
        name,
        visibility,
        mode,
        passwordHash,
        expiresAt,
        permissions: finalPermissions,
        createdById: existingUser ? existingUser.id : null,
      },
    });

    let recipient = null;
    let recipientToken = mainToken;

    // 4. If email mode, create ShareLinkRecipient and send invite email
    if (mode === 'email' && email && email.trim()) {
      recipientToken = generateToken();
      recipient = await prisma.shareLinkRecipient.create({
        data: {
          shareLinkId: shareLink.id,
          email: email.trim().toLowerCase(),
          token: recipientToken,
        },
      });

      const appBaseUrl = req.headers.origin || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
      const shareUrl = `${appBaseUrl.replace(/\/$/, '')}/s/${recipientToken}`;

      const orgBranding = await resolveOrgBranding(prisma, orgId, { forEmail: true });
      const emailLogoUrl = orgBranding?.logoUrl || 'https://qa.noahcloud.ai/noah-logo.png';

      await emailService.sendShareInvite(email.trim(), {
        assetTitle: asset.originalName || asset.title || 'Media File',
        shareUrl,
        expiresAt,
        permissions: finalPermissions,
        hasPassword: Boolean(passwordHash),
        password: finalPassword ? finalPassword.trim() : null,
        senderName: user.name || user.email || 'NOAH Team Member',
        orgLogoUrl: emailLogoUrl,
        orgName: orgBranding?.accountName || null,
      });
    }

    const appBase = req.headers.origin || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
    const publicUrl = `${appBase.replace(/\/$/, '')}/s/${recipientToken}`;

    // 5. Create System activity log in Annotation table
    try {
      const userName = user?.name || user?.email || 'User';
      const accessLabel = visibility === 'public' ? 'a public share link' : 'a password-protected share link';
      await prisma.annotation.create({
        data: {
          orgId,
          assetId,
          userId: user?.id || null,
          type: 'system',
          data: {
            action: 'SHARE_CREATED',
            text: `${userName} created ${accessLabel}`,
            authorName: userName,
            visibility,
          }
        }
      });
    } catch (logErr) {
      req.log.error('Failed to log system share annotation', logErr);
    }

    return reply.code(201).send({
      success: true,
      message: mode === 'email' ? `Invite sent to ${email}` : 'Share link created',
      shareLink: {
        id: shareLink.id,
        assetId: shareLink.assetId,
        token: recipientToken,
        name: shareLink.name,
        visibility: shareLink.visibility,
        mode: shareLink.mode,
        expiresAt: shareLink.expiresAt,
        permissions: shareLink.permissions,
        hasPassword: Boolean(passwordHash),
        password: finalPassword || undefined, // Include generated password so frontend can display it
        url: publicUrl,
        recipient: recipient ? { id: recipient.id, email: recipient.email } : null,
      },
    });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to create share link', message: error.message });
  }
}

/**
 * Owner API: GET /api/media/:id/share-links
 * Lists active non-expired share links for an asset
 */
async function getShareLinks(req, reply) {
  const { prisma } = req.server;
  const assetId = req.params.id;
  const now = new Date();

  try {
    const shareLinks = await prisma.shareLink.findMany({
      where: {
        assetId,
        revokedAt: null,
        expiresAt: { gt: now }, // Automatically hides expired share links!
      },
      include: {
        recipients: {
          where: { revokedAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const appBase = req.headers.origin || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';

    const formatted = shareLinks.map((link) => {
      const activeRecipient = link.recipients[0];
      const linkToken = activeRecipient ? activeRecipient.token : link.token;
      return {
        id: link.id,
        assetId: link.assetId,
        name: link.name,
        visibility: link.visibility,
        token: linkToken,
        mode: link.mode,
        expiresAt: link.expiresAt,
        permissions: link.permissions,
        hasPassword: Boolean(link.passwordHash),
        downloadCount: link.downloadCount,
        createdAt: link.createdAt,
        url: `${appBase.replace(/\/$/, '')}/s/${linkToken}`,
        recipients: link.recipients.map((r) => ({
          id: r.id,
          email: r.email,
          accessCount: r.accessCount,
          lastAccessedAt: r.lastAccessedAt,
          sentAt: r.sentAt,
        })),
      };
    });

    return reply.send({ data: formatted });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to fetch share links', message: error.message });
  }
}

/**
 * Owner API: PATCH /api/share-links/:id
 * Updates name or visibility of a share link
 */
async function updateShareLink(req, reply) {
  const { prisma } = req.server;
  const shareLinkId = req.params.id;
  const { name, visibility, permissions } = req.body || {};

  try {
    const existingLink = await prisma.shareLink.findUnique({ where: { id: shareLinkId } });
    if (!existingLink) return reply.code(404).send({ error: 'Share link not found' });

    let finalPermissions = permissions;
    if (permissions) {
      const { ensureDefaultOrganizationSettings } = require('../services/organization.service');
      const orgSettings = await ensureDefaultOrganizationSettings(prisma, existingLink.orgId);
      finalPermissions = { ...(existingLink.permissions || {}), ...permissions };

      if (orgSettings.lockAllowComments && orgSettings.allowCommentsDefault !== undefined) {
        finalPermissions.comment = orgSettings.allowCommentsDefault;
      }
      if (orgSettings.lockAllowDownloadOriginal && orgSettings.allowDownloadOriginalDefault !== undefined) {
        finalPermissions.download = orgSettings.allowDownloadOriginalDefault;
      }
      if (orgSettings.lockAllowDownloadProxy && orgSettings.allowDownloadProxyDefault !== undefined) {
        finalPermissions.downloadProxy = orgSettings.allowDownloadProxyDefault;
      }
      if (orgSettings.lockShowCompanyWatermark && orgSettings.showCompanyWatermarkDefault !== undefined) {
        finalPermissions.watermark = orgSettings.showCompanyWatermarkDefault;
      }
    }

    const updated = await prisma.shareLink.update({
      where: { id: shareLinkId },
      data: {
        ...(name !== undefined && { name }),
        ...(visibility !== undefined && {
          visibility,
          ...(visibility === 'public' ? { passwordHash: null } : {})
        }),
        ...(finalPermissions !== undefined && { permissions: finalPermissions }),
      }
    });

    try {
      const userName = req.user?.name || req.user?.email || 'User';
      await prisma.annotation.create({
        data: {
          orgId: updated.orgId,
          assetId: updated.assetId,
          userId: req.user?.id || null,
          type: 'system',
          data: {
            action: 'SHARE_UPDATED',
            text: `${userName} updated share link settings`,
            authorName: userName,
          }
        }
      });
    } catch (logErr) {
      req.log.error('Failed to log system share update annotation', logErr);
    }

    return reply.send({ success: true, message: 'Share link updated successfully', shareLink: updated });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to update share link', message: error.message });
  }
}

/**
 * Owner API: DELETE /api/share-links/:id
 * Revokes a share link
 */
async function deleteShareLink(req, reply) {
  const { prisma } = req.server;
  const targetId = req.params.id;

  try {
    // 1. Check if targetId is a ShareLink
    const shareLink = await prisma.shareLink.findUnique({
      where: { id: targetId },
    });

    if (shareLink) {
      try {
        const userName = req.user?.name || req.user?.email || 'User';
        await prisma.annotation.create({
          data: {
            orgId: shareLink.orgId,
            assetId: shareLink.assetId,
            userId: req.user?.id || null,
            type: 'system',
            data: {
              action: 'SHARE_REVOKED',
              text: `${userName} revoked a share link`,
              authorName: userName,
            }
          }
        });
      } catch (logErr) {
        req.log.error('Failed to log system share revoke annotation', logErr);
      }

      await prisma.shareLinkRecipient.deleteMany({
        where: { shareLinkId: targetId },
      });
      await prisma.shareLink.delete({
        where: { id: targetId },
      });
      return reply.send({ success: true, message: 'Share link deleted successfully', id: targetId });
    }

    // 2. Check if targetId is a ShareLinkRecipient
    const recipient = await prisma.shareLinkRecipient.findUnique({
      where: { id: targetId },
    });

    if (recipient) {
      await prisma.shareLinkRecipient.delete({
        where: { id: targetId },
      });
      return reply.send({ success: true, message: 'Recipient removed successfully', id: targetId });
    }

    // 3. If already deleted or not found, return success gracefully
    return reply.send({ success: true, message: 'Share link or recipient already removed', id: targetId });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to delete share link', message: error.message });
  }
}

/**
 * Owner API: POST /api/share-links/:id/resend
 * Resends email invite to recipients
 */
async function resendShareLinkInvite(req, reply) {
  const { prisma, emailService } = req.server;
  const shareLinkId = req.params.id;
  const user = req.user;

  try {
    const shareLink = await prisma.shareLink.findFirst({
      where: { id: shareLinkId, revokedAt: null },
      include: {
        asset: true,
        recipients: { where: { revokedAt: null } },
      },
    });

    if (!shareLink || (shareLink.expiresAt && new Date(shareLink.expiresAt) <= new Date())) {
      return reply.code(404).send({ error: 'Share link is expired or not found' });
    }

    const appBaseUrl = req.headers.origin || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';

    const orgBranding = await resolveOrgBranding(prisma, shareLink.orgId, { forEmail: true });
    const emailLogoUrl = orgBranding?.logoUrl || 'https://qa.noahcloud.ai/noah-logo.png';

    for (const recipient of shareLink.recipients) {
      const shareUrl = `${appBaseUrl.replace(/\/$/, '')}/s/${recipient.token}`;
      await emailService.sendShareInvite(recipient.email, {
        assetTitle: shareLink.asset?.originalName || shareLink.asset?.title || 'Media File',
        shareUrl,
        expiresAt: shareLink.expiresAt,
        permissions: shareLink.permissions,
        hasPassword: Boolean(shareLink.passwordHash),
        senderName: user.name || user.email || 'NOAH Team Member',
        orgLogoUrl: emailLogoUrl,
        orgName: orgBranding?.accountName || null,
      });
    }

    return reply.send({ success: true, message: 'Invites resent successfully' });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to resend invite', message: error.message });
  }
}

/**
 * Helper to resolve share token (either main token or recipient token)
 */
async function resolveShareToken(prisma, token) {
  // Check recipient token first
  const recipient = await prisma.shareLinkRecipient.findFirst({
    where: { token, revokedAt: null },
    include: {
      shareLink: {
        include: {
          asset: { include: { files: true, metadata: true } },
          organization: true
        },
      },
    },
  });

  if (recipient && recipient.shareLink) {
    const shareLink = recipient.shareLink;
    if (shareLink.revokedAt || (shareLink.expiresAt && new Date(shareLink.expiresAt) <= new Date())) {
      return null;
    }
    return { shareLink, recipient };
  }

  // Check main share link token
  const shareLink = await prisma.shareLink.findFirst({
    where: { token, revokedAt: null },
    include: {
      asset: { include: { files: true, metadata: true } },
      organization: true
    },
  });

  if (shareLink) {
    if (shareLink.revokedAt || (shareLink.expiresAt && new Date(shareLink.expiresAt) <= new Date())) {
      return null;
    }
    return { shareLink, recipient: null };
  }

  return null;
}

/**
 * Public API: GET /api/share/:token
 * Validates share token and returns asset metadata & permissions
 */
async function validateShareToken(req, reply) {
  const { prisma } = req.server;
  const token = req.params.token;

  try {
    const resolved = await resolveShareToken(prisma, token);
    if (!resolved) {
      return reply.code(404).send({
        error: 'Share link has expired or does not exist',
        expired: true,
      });
    }

    const { shareLink, recipient } = resolved;
    const asset = shareLink.asset;

    // Track access count
    if (recipient) {
      await prisma.shareLinkRecipient.update({
        where: { id: recipient.id },
        data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      });
    }

    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { lastAccessedAt: new Date() },
    });

    // Share link view notification logic with privacy toggle check
    let shouldNotify = true;
    let viewerName = 'Someone';
    
    if (req.user) {
      viewerName = req.user.name || req.user.email || 'A user';
      const viewerDb = await prisma.user.findUnique({ where: { id: req.user.id }});
      if (viewerDb && viewerDb.shareLinkActivityEnabled === false) {
        shouldNotify = false;
      }
    }

    if (shouldNotify) {
      const creatorId = shareLink.createdById || asset.uploadedByUserId;
      if (creatorId && creatorId !== req.user?.id) {
        try {
          await createNotification(
            req.server,
            creatorId,
            shareLink.orgId,
            'share_link_viewed',
            'Share Link Viewed',
            `${viewerName} viewed your shared link: ${shareLink.name || asset.title || 'Media'}`,
            asset.id
          );
        } catch (notifErr) {
          req.log.warn('Failed to send share link view notification: ', notifErr.message);
        }
      }
    }

    // Build a permanent publicly-accessible logo URL via the proxy endpoint
    // This works even with a private B2 bucket — no presigned URLs needed
    const reqOrigin = req.headers.origin || process.env.WEBHOOK_HOST || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
    const publicApiBase = (process.env.WEBHOOK_HOST || process.env.APP_URL || reqOrigin).replace(/\/$/, '');
    const useProxyUrl = !publicApiBase.includes('localhost');

    let logoUrl = null;
    if (shareLink.orgId) {
      logoUrl = useProxyUrl
        ? `${publicApiBase}/api/public/branding/logo/${shareLink.orgId}`
        : (shareLink.organization?.metadata?.logoUrl || null);
    }

    let branding = null;
    try {
      const dbBranding = await prisma.organisationBrandingSetting.findUnique({
        where: { orgId: shareLink.orgId }
      });
      if (dbBranding) {
        // Use proxy URL for logo — works with private B2 bucket (streams image via server)
        const bLogoUrl = useProxyUrl
          ? `${publicApiBase}/api/public/branding/logo/${shareLink.orgId}`
          : (dbBranding.logoUrl || logoUrl || null);

        // headerImageUrl still uses presigned URL (header images are for guest page background, not email)
        let bHeaderImageUrl = dbBranding.headerImageUrl;
        if (dbBranding.headerImageKey && (await b2()).isEnabled()) {
          bHeaderImageUrl = await (await b2()).getPresignedUrl(dbBranding.headerImageKey).catch(() => dbBranding.headerImageUrl);
        }
        branding = {
          accountName: dbBranding.accountName || shareLink.organization?.name || "User's Account",
          accountInitials: dbBranding.accountInitials || (dbBranding.accountName ? dbBranding.accountName.slice(0, 2).toUpperCase() : 'NO'),
          logoUrl: bLogoUrl || logoUrl || null,
          headerImageUrl: bHeaderImageUrl || null,
          accentColor: dbBranding.accentColor || '#5B53FF',
          reelBackgroundColor: dbBranding.reelBackgroundColor || 'None',
          reelTitleColor: dbBranding.reelTitleColor || 'None',
        };
      }
    } catch (bErr) {
      req.log.error('Failed to fetch branding for share token', bErr);
    }

    if (!branding) {
      branding = {
        accountName: shareLink.organization?.name || "User's Account",
        logoUrl: logoUrl || null,
        headerImageUrl: null,
        accentColor: '#5B53FF',
        reelBackgroundColor: 'None',
        reelTitleColor: 'None',
      };
    }

    const originalFile = asset?.files?.find(f => f.fileClass === 'original');
    const techSpecs = asset?.metadata?.technicalSpecs || {};
    const customProps = asset?.metadata?.customProperties || {};
    const width = techSpecs.width || customProps.width;
    const height = techSpecs.height || customProps.height;
    const resTier = (width && height) ? (Math.max(width, height) >= 3840 ? '4K' : Math.max(width, height) >= 2560 ? '2K' : Math.max(width, height) >= 1920 ? '1080p' : Math.max(width, height) >= 1280 ? '720p' : 'SD') : undefined;
    const fpsVal = techSpecs.fps || customProps.fps;
    const durationVal = techSpecs.durationSeconds || techSpecs.duration || customProps.durationSeconds || customProps.duration;
    const fileSizeVal = Number(originalFile?.sizeBytes || asset?.fileSize || 0);

    return reply.send({
      valid: true,
      requiresPassword: Boolean(shareLink.passwordHash),
      permissions: shareLink.permissions,
      expiresAt: shareLink.expiresAt,
      visibility: shareLink.visibility,
      mode: shareLink.mode,
      branding,
      assetMeta: {
        id: asset ? asset.id : shareLink.assetId,
        title: asset ? (asset.originalName || asset.title) : 'Shared Asset',
        fileType: asset ? (asset.type || asset.fileType || 'video') : 'video',
        type: asset ? (asset.type || 'video') : 'video',
        mimeType: asset ? asset.mimeType : undefined,
        fileSize: fileSizeVal,
        file_size: fileSizeVal,
        resolution_tier: resTier,
        resolutionTier: resTier,
        fps: fpsVal,
        duration: durationVal,
        logoUrl: branding?.logoUrl || logoUrl,
        organizationName: shareLink.organization?.name || null,
      },
    });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to validate share link', message: error.message });
  }
}

/**
 * Public API: POST /api/share/:token/unlock
 * Unlocks password-protected share link
 */
async function unlockShareToken(req, reply) {
  const { prisma } = req.server;
  const token = req.params.token;
  const { password } = req.body || {};

  try {
    const resolved = await resolveShareToken(prisma, token);
    if (!resolved) {
      return reply.code(404).send({ error: 'Share link has expired or does not exist', expired: true });
    }

    const { shareLink } = resolved;

    if (!shareLink.passwordHash) {
      return reply.send({ success: true, unlocked: true });
    }

    if (!password) {
      return reply.code(400).send({ error: 'Password required' });
    }

    const match = await argon2.verify(shareLink.passwordHash, password.trim());
    if (!match) {
      return reply.code(401).send({ error: 'Incorrect password' });
    }

    // Sign a short-lived share session token
    const sessionToken = req.server.jwt.sign(
      { shareLinkId: shareLink.id, token, scope: 'share_session' },
      { expiresIn: '2h' }
    );

    return reply.send({
      success: true,
      unlocked: true,
      sessionToken,
    });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Unlock failed', message: error.message });
  }
}

/**
 * Public API: GET /api/share/:token/stream
 * Streams video preview for validated guest sessions
 */
async function getShareStream(req, reply) {
  const { prisma } = req.server;
  const token = req.params.token;

  try {
    const resolved = await resolveShareToken(prisma, token);
    if (!resolved) {
      return reply.code(404).send({ error: 'Link expired or invalid' });
    }

    const { shareLink } = resolved;
    const asset = shareLink.asset;
    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }

    const isDownload = req.query?.download === 'true';

    if (isDownload) {
      let shouldNotify = true;
      let viewerName = 'Someone';
      
      if (req.user) {
        viewerName = req.user.name || req.user.email || 'A user';
        const viewerDb = await prisma.user.findUnique({ where: { id: req.user.id }});
        if (viewerDb && viewerDb.shareLinkActivityEnabled === false) {
          shouldNotify = false;
        }
      }

      if (shouldNotify) {
        const creatorId = shareLink.createdById || asset.uploadedByUserId;
        if (creatorId && creatorId !== req.user?.id) {
          try {
            await createNotification(
              req.server,
              creatorId,
              shareLink.orgId,
              'share_link_downloaded',
              'Share Link Downloaded',
              `${viewerName} downloaded your shared link: ${shareLink.name || asset.title || 'Media'}`,
              asset.id
            );
          } catch (notifErr) {
            req.log.warn('Failed to send share link download notification: ', notifErr.message);
          }
        }
      }
    }

    return await handleMediaRedirectOrServe(req, reply, asset.id, isDownload);
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Stream failed', message: error.message });
  }
}

/**
 * Public API: GET /api/share/:token/annotations
 * Fetches guest/public annotations for shared asset
 */
async function getShareAnnotations(req, reply) {
  const { prisma } = req.server;
  const token = req.params.token;

  try {
    const resolved = await resolveShareToken(prisma, token);
    if (!resolved) {
      return reply.code(404).send({ error: 'Link expired' });
    }

    const { shareLink } = resolved;
    const annotations = await prisma.annotation.findMany({
      where: { assetId: shareLink.assetId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    });

    const formatted = annotations.map((ann) => ({
      ...ann,
      readByUsers: ann.data?.readByUsers || [],
      unread: Boolean(
        (ann.guestName || ann.guestEmail || ann.data?.guestEmail) &&
        !(ann.data?.readByUsers || []).length
      ),
      videoTimestamp: ann.videoTimestamp ? Number(ann.videoTimestamp) : (ann.data?.videoTimestamp ? Number(ann.data.videoTimestamp) : null),
      author: ann.user ? {
        name: ann.user.name || 'Member',
        email: ann.user.email,
        initials: (ann.user.name || 'M')[0]?.toUpperCase(),
        isGuest: false,
      } : ((ann.guestName || ann.guestEmail || ann.data?.guestName || ann.data?.guestEmail) ? {
        name: (ann.guestName || ann.data?.guestName)
          ? ((ann.guestEmail || ann.data?.guestEmail)
            ? `${ann.guestName || ann.data?.guestName} (${ann.guestEmail || ann.data?.guestEmail})`
            : (ann.guestName || ann.data?.guestName))
          : (ann.guestEmail || ann.data?.guestEmail || 'Guest User'),
        email: ann.guestEmail || ann.data?.guestEmail || null,
        initials: ((ann.guestName || ann.data?.guestName || ann.guestEmail || ann.data?.guestEmail || 'G')[0] || 'G').toUpperCase(),
        isGuest: true,
      } : null)
    }));

    return reply.send({ data: formatted });

  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to fetch annotations', message: error.message });
  }
}

/**
 * Public API: POST /api/share/:token/annotations
 * Allows guest to post a comment
 */
async function createShareAnnotation(req, reply) {
  const { prisma } = req.server;
  const token = req.params.token;

  try {
    const resolved = await resolveShareToken(prisma, token);
    if (!resolved) {
      return reply.code(404).send({ error: 'Link expired' });
    }

    const { shareLink, recipient } = resolved;
    const permissions = shareLink.permissions || {};
    if (!permissions.comment) {
      return reply.code(403).send({ error: 'Commenting is not allowed on this share link' });
    }

    const { guestName = 'Guest User', text, videoTimestamp, type = 'comment', data = {} } = req.body || {};

    if (type === 'comment' && !text && !data.text) {
      return reply.code(400).send({ error: 'Comment text is required' });
    }

    const effectiveEmail = recipient ? recipient.email : (req.body?.guestEmail || undefined);
    const guestDisplayName = guestName.trim();

    const annotation = await prisma.annotation.create({
      data: {
        orgId: shareLink.orgId,
        assetId: shareLink.assetId,
        guestName: guestDisplayName,
        guestEmail: effectiveEmail,
        shareLinkToken: token,
        type,
        videoTimestamp: (videoTimestamp !== undefined && videoTimestamp !== null && !isNaN(Number(videoTimestamp))) ? parseFloat(videoTimestamp) : null,
        data: { guestName: guestDisplayName, guestEmail: effectiveEmail, ...data, ...(text || data.text ? { text: text || data.text } : {}) },
      },
    });

    // Broadcast real-time websocket event to all active view rooms of this asset
    try {
      broadcastToRoom(shareLink.assetId, {
        type: 'NEW_ANNOTATION',
        payload: {
          id: annotation.id,
          type: annotation.type,
          text: text || data.text || '',
          videoTimestamp: annotation.videoTimestamp ? Number(annotation.videoTimestamp) : null,
          data: annotation.data,
          createdAt: annotation.createdAt,
          author: {
            name: guestDisplayName ? (effectiveEmail ? `${guestDisplayName} (${effectiveEmail})` : guestDisplayName) : (effectiveEmail || 'Guest User'),
            email: effectiveEmail || null,
            isGuest: true,
          },
        },
      });
    } catch (wsErr) {
      req.log.error('Failed to broadcast guest annotation websocket message', wsErr);
    }

    return reply.code(201).send({ success: true, annotation });
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({ error: 'Failed to post comment', message: error.message });
  }
}


async function getPublicOrgLogo(req, reply) {
  const { prisma } = req.server;
  const { orgId } = req.params;
  const FALLBACK_LOGO = 'https://qa.noahcloud.ai/noah-logo.png';

  try {
    if (!orgId) {
      return reply.redirect(FALLBACK_LOGO, 302);
    }

    // Fetch branding from DB to get logoKey
    const branding = await prisma.organisationBrandingSetting.findUnique({ where: { orgId } }).catch(() => null);
    const org = !branding ? await prisma.organization.findUnique({ where: { id: orgId } }).catch(() => null) : null;
    const logoKey = branding?.logoKey || org?.metadata?.logoKey || null;

    if (!logoKey) {
      // No custom logo — redirect to default
      return reply.redirect(FALLBACK_LOGO, 302);
    }

    if (!(await b2()).isEnabled()) {
      return reply.redirect(FALLBACK_LOGO, 302);
    }

    // Proxy the image directly from B2 using authenticated SDK (GetObject)
    // This works even with a PRIVATE B2 bucket because our server authenticates
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: (await b2()).bucket,
      Key: logoKey,
    });

    const s3Response = await (await b2()).s3Client.send(command);

    const contentType = s3Response.ContentType || 'image/png';
    const contentLength = s3Response.ContentLength;

    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400'); // cache 24h in CDN/proxy
    if (contentLength) {
      reply.header('Content-Length', String(contentLength));
    }

    return reply.send(s3Response.Body);
  } catch (err) {
    req.log.warn('[getPublicOrgLogo] Failed to proxy logo for org', orgId, err.message);
    return reply.redirect(FALLBACK_LOGO, 302);
  }
}

module.exports = {
  createShareLink,
  getShareLinks,
  listAssetShareLinks: getShareLinks,
  deleteShareLink,
  revokeShareLink: deleteShareLink,
  resendShareLinkInvite,
  validateShareToken,
  getPublicShareLink: validateShareToken,
  unlockShareToken,
  getShareStream,
  getPublicShareAssetMedia: getShareStream,
  getShareAnnotations,
  createShareAnnotation,
  updateShareLink,
  getPublicOrgLogo,
};
