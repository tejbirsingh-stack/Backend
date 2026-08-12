const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const B2StorageService = require('../b2-storage.cjs');

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

/**
 * Format bytes into human-readable string using B2/Cloud standard (1 MB = 1,000,000 Bytes)
 */
function formatBytes(bytes) {
  const b = Number(bytes);
  if (isNaN(b) || b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), units.length - 1);
  if (i === 0) return `${b} B`;
  const val = b / Math.pow(k, i);
  const formattedVal = Math.abs(val - Math.round(val)) < 0.05 ? Math.round(val) : val.toFixed(1);
  return `${formattedVal} ${units[i]}`;
}

/**
 * Assert that adding additionalBytes will not exceed org storage quota
 */
async function assertQuotaAvailable(orgId, additionalBytes = 0) {
  if (!orgId) return;

  let org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { currentPlan: true },
  });

  if (!org) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }

  if (!org.currentPlan && org.planType) {
    try {
      const matchedPlan = await prisma.plan.findFirst({
        where: {
          OR: [
            { id: org.planType.toLowerCase().trim() },
            { name: { equals: org.planType.trim(), mode: 'insensitive' } },
          ],
        },
      });
      if (matchedPlan) {
        org.currentPlanId = matchedPlan.id;
        org.currentPlan = matchedPlan;
        await prisma.organization.update({
          where: { id: orgId },
          data: { currentPlanId: matchedPlan.id, storageQuotaBytes: matchedPlan.storageQuotaBytes },
        }).catch(() => {});
      }
    } catch {}
  }

  const quota = BigInt(org.currentPlan?.storageQuotaBytes ?? 314572800n);
  const used = BigInt(org.storageUsedBytes || 0);
  const add = BigInt(additionalBytes);

  if (used + add >= quota) {
    const err = new Error('Storage limit reached. Please upgrade your plan to upload more files.');
    err.statusCode = 403;
    err.code = 'QUOTA_EXCEEDED';
    err.details = {
      storageUsedBytes: Number(used),
      storageQuotaBytes: Number(quota),
      requestedBytes: Number(add),
      warningLevel: 'exceeded',
    };
    throw err;
  }
}

/**
 * Record atomic storage delta in Organization + append UsageEvent
 */
async function recordStorageDelta(txOrClient, { orgId, storageSystemId, deltaBytes, assetId, assetFileId, reason }) {
  if (!orgId || !deltaBytes) return;

  const client = txOrClient || prisma;
  const delta = BigInt(deltaBytes);

  // 1. Atomic SQL update to update storage_used_bytes (clamp at 0)
  await client.$executeRaw`
    UPDATE organizations 
    SET storage_used_bytes = GREATEST(0, storage_used_bytes + ${delta})
    WHERE id = ${orgId}::uuid
  `;

  // 2. Resolve storageSystemId if not provided
  let systemId = storageSystemId;
  if (!systemId) {
    const sys = await client.storageSystem.findFirst({
      where: { orgId, provider: 'BACKBLAZE_B2', isPrimary: true },
      select: { id: true },
    });
    if (sys) systemId = sys.id;
  }

  // 3. Log append-only UsageEvent
  await client.usageEvent.create({
    data: {
      orgId,
      storageSystemId: systemId,
      assetId: assetId || null,
      assetFileId: assetFileId || null,
      metric: 'STORAGE_BYTES_DELTA',
      delta,
      metadata: { reason: reason || 'file_change' },
    },
  });
}

/**
 * Record egress bandwidth usage
 */
async function recordBandwidth({ orgId, storageSystemId, bytes, assetId, userId }) {
  if (!orgId || !bytes) return;
  const delta = BigInt(bytes);

  let systemId = storageSystemId;
  if (!systemId) {
    const sys = await prisma.storageSystem.findFirst({
      where: { orgId, provider: 'BACKBLAZE_B2', isPrimary: true },
      select: { id: true },
    });
    if (sys) systemId = sys.id;
  }

  await prisma.usageEvent.create({
    data: {
      orgId,
      storageSystemId: systemId,
      userId: userId || null,
      assetId: assetId || null,
      metric: 'BANDWIDTH_BYTES',
      delta,
      metadata: { timestamp: new Date().toISOString() },
    },
  });
}

/**
 * Record B2 Class A/B API operation counter
 */
async function recordTransaction({ orgId, storageSystemId, opClass, count = 1, op }) {
  if (!orgId || !opClass) return;
  const metric = opClass.toUpperCase() === 'A' ? 'CLASS_A' : 'CLASS_B';

  let systemId = storageSystemId;
  if (!systemId) {
    const sys = await prisma.storageSystem.findFirst({
      where: { orgId, provider: 'BACKBLAZE_B2', isPrimary: true },
      select: { id: true },
    });
    if (sys) systemId = sys.id;
  }

  await prisma.usageEvent.create({
    data: {
      orgId,
      storageSystemId: systemId,
      metric,
      delta: BigInt(count),
      metadata: { op: op || 'b2_op' },
    },
  });
}

/**
 * Get comprehensive usage summary for an organization
 */
async function getUsageSummary(orgId) {
  let org;
  try {
    org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        currentPlan: true,
        storageSystems: true,
      },
    });
  } catch (includeErr) {
    org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        currentPlan: true,
      },
    });
    if (org) org.storageSystems = [];
  }

  if (!org.currentPlan && org.planType) {
    try {
      const matchedPlan = await prisma.plan.findFirst({
        where: {
          OR: [
            { id: org.planType.toLowerCase().trim() },
            { name: { equals: org.planType.trim(), mode: 'insensitive' } },
          ],
        },
      });
      if (matchedPlan) {
        org.currentPlanId = matchedPlan.id;
        org.currentPlan = matchedPlan;
        prisma.organization.update({
          where: { id: orgId },
          data: { currentPlanId: matchedPlan.id },
        }).catch(() => {});
      }
    } catch {}
  }

  // 1. Members / Seats
  const membersTotal = org.currentPlan?.maxUsers ?? org.maxUsers ?? 5;
  const orgUsers = await prisma.user.findMany({
    where: { orgId },
    select: { status: true },
  });

  let membersActive = 0;
  let membersPending = 0;
  for (const u of orgUsers) {
    const s = (u.status || '').toLowerCase().trim();
    if (s === 'active') {
      membersActive++;
    } else {
      membersPending++;
    }
  }
  const membersUsed = orgUsers.length;

  const seatsPercent = (membersUsed / Math.max(membersTotal, 1)) * 100;
  let seatsWarningLevel = 'ok';
  if (seatsPercent >= 100) seatsWarningLevel = 'exceeded';
  else if (seatsPercent >= (org.usageWarningPercent || 80)) seatsWarningLevel = 'warning';

  // 2. Storage breakdown by media type (Video, Images, Audio, Documents)
  const assetFiles = await prisma.assetFile.findMany({
    where: {
      asset: {
        orgId,
        status: { not: 'permanently_deleted' },
      },
    },
    select: {
      sizeBytes: true,
      mimeType: true,
      asset: {
        select: {
          type: true,
        },
      },
    },
  });

  let videoBytes = 0n;
  let imageBytes = 0n;
  let audioBytes = 0n;
  let docBytes = 0n;
  let otherBytes = 0n;

  for (const f of assetFiles) {
    const size = BigInt(f.sizeBytes || 0);
    const mime = (f.mimeType || '').toLowerCase();
    const type = (f.asset?.type || '').toLowerCase();

    if (type === 'video' || mime.startsWith('video/')) {
      videoBytes += size;
    } else if (type === 'image' || mime.startsWith('image/')) {
      imageBytes += size;
    } else if (type === 'audio' || mime.startsWith('audio/')) {
      audioBytes += size;
    } else if (type === 'document' || mime.startsWith('application/') || mime.startsWith('text/')) {
      docBytes += size;
    } else {
      otherBytes += size;
    }
  }

  // Query direct physical B2 folder sizes if B2 service is enabled
  if (b2Storage.isEnabled()) {
    try {
      const orgSlug = org.slug || (org.name ? org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '');
      if (orgSlug) {
        const [v1, v2, i1, i2, a1, a2, d1, d2] = await Promise.all([
          b2Storage.getFolderSize(`noah-uploads/${orgSlug}/videos/`),
          b2Storage.getFolderSize(`uploads/${orgSlug}/videos/`),
          b2Storage.getFolderSize(`noah-uploads/${orgSlug}/images/`),
          b2Storage.getFolderSize(`uploads/${orgSlug}/images/`),
          b2Storage.getFolderSize(`noah-uploads/${orgSlug}/audios/`),
          b2Storage.getFolderSize(`uploads/${orgSlug}/audios/`),
          b2Storage.getFolderSize(`noah-uploads/${orgSlug}/files/`),
          b2Storage.getFolderSize(`uploads/${orgSlug}/files/`),
        ]);

        const b2VideoTotal = BigInt(v1 + v2);
        const b2ImageTotal = BigInt(i1 + i2);
        const b2AudioTotal = BigInt(a1 + a2);
        const b2DocTotal = BigInt(d1 + d2);

        if (b2VideoTotal > 0n || b2ImageTotal > 0n || b2AudioTotal > 0n || b2DocTotal > 0n) {
          videoBytes = b2VideoTotal;
          imageBytes = b2ImageTotal;
          audioBytes = b2AudioTotal;
          docBytes = b2DocTotal;
          otherBytes = 0n;
        }
      }
    } catch (b2Err) {
      console.warn('Failed to query direct B2 folder sizes:', b2Err.message);
    }
  }

  const actualTotalBytes = videoBytes + imageBytes + audioBytes + docBytes + otherBytes;
  const storageUsedBytes = actualTotalBytes;

  // Auto-sync org.storageUsedBytes in DB if there is any drift
  if (BigInt(org.storageUsedBytes || 0) !== actualTotalBytes) {
    prisma.organization.update({
      where: { id: orgId },
      data: { storageUsedBytes: actualTotalBytes },
    }).catch((e) => console.warn('Background storageUsedBytes sync error:', e.message));
  }
  const storageQuotaBytes = BigInt(org.currentPlan?.storageQuotaBytes ?? org.storageQuotaBytes ?? 314572800n);

  const storagePercent = Number((storageUsedBytes * BigInt(100)) / (storageQuotaBytes > 0n ? storageQuotaBytes : 1n));

  let storageWarningLevel = 'ok';
  if (storagePercent >= 100) storageWarningLevel = 'exceeded';
  else if (storagePercent >= (org.usageWarningPercent || 80)) storageWarningLevel = 'warning';

  const warningLevel = (storageWarningLevel === 'exceeded' || seatsWarningLevel === 'exceeded')
    ? 'exceeded'
    : (storageWarningLevel === 'warning' || seatsWarningLevel === 'warning')
      ? 'warning'
      : 'ok';

  const storageBreakdown = [
    {
      id: 'video',
      label: 'Video',
      valueLabel: formatBytes(videoBytes),
      valueBytes: Number(videoBytes),
      color: '#9353D3',
    },
    {
      id: 'images',
      label: 'Images',
      valueLabel: formatBytes(imageBytes),
      valueBytes: Number(imageBytes),
      color: '#006FEE',
    },
    {
      id: 'audio',
      label: 'Audio',
      valueLabel: formatBytes(audioBytes),
      valueBytes: Number(audioBytes),
      color: '#F5A524',
    },
    {
      id: 'documents',
      label: 'Documents',
      valueLabel: formatBytes(docBytes + otherBytes),
      valueBytes: Number(docBytes + otherBytes),
      color: '#17C964',
    },
  ];

  // 4. Storage Systems list
  let storageSystems = org.storageSystems.map((s) => ({
    id: s.id,
    provider: s.provider,
    name: s.name,
    usedBytes: Number(storageUsedBytes),
    usedLabel: formatBytes(storageUsedBytes),
  }));

  if (storageSystems.length === 0) {
    storageSystems = [
      {
        id: 'primary-b2',
        provider: 'BACKBLAZE_B2',
        name: 'Backblaze B2',
        usedBytes: Number(storageUsedBytes),
        usedLabel: formatBytes(storageUsedBytes),
      },
    ];
  }

  // 5. Bandwidth MTD & B2 Transactions
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const bandwidthEvent = await prisma.usageEvent.aggregate({
    _sum: { delta: true },
    where: {
      orgId,
      metric: 'BANDWIDTH_BYTES',
      occurredAt: { gte: startOfMonth },
    },
  });
  const bandwidthBytesMonthToDate = Number(bandwidthEvent._sum.delta || 0n);

  const classAEvent = await prisma.usageEvent.aggregate({
    _sum: { delta: true },
    where: {
      orgId,
      metric: 'CLASS_A',
      occurredAt: { gte: startOfMonth },
    },
  });

  const classBEvent = await prisma.usageEvent.aggregate({
    _sum: { delta: true },
    where: {
      orgId,
      metric: 'CLASS_B',
      occurredAt: { gte: startOfMonth },
    },
  });

  // 6. Counts for Projects & Workspaces
  const projectsCount = await prisma.project.count({ where: { workspace: { orgId } } });
  const workspacesCount = await prisma.workspace.count({ where: { orgId } });
  const projectsTotal = org.currentPlan?.maxProjects ?? org.maxProjects ?? 1;
  const workspacesTotal = org.currentPlan?.maxWorkspaces ?? org.maxWorkspaces ?? 1;

  return {
    membersUsed,
    membersTotal,
    membersActive,
    membersPending,
    seatsWarningLevel,
    storageUsedBytes: Number(storageUsedBytes),
    storageQuotaBytes: Number(storageQuotaBytes),
    storageUsedLabel: formatBytes(storageUsedBytes),
    storageCapLabel: formatBytes(storageQuotaBytes),
    storageUsedPercent: storagePercent,
    storageWarningLevel,
    warningLevel,
    storageBreakdown,
    storageSystems,
    transfers: {
      bandwidthBytesMonthToDate,
      bandwidthLabel: formatBytes(bandwidthBytesMonthToDate),
    },
    b2Transactions: {
      classA: Number(classAEvent._sum.delta || 0n),
      classB: Number(classBEvent._sum.delta || 0n),
    },
    projectsCount,
    projectsTotal,
    workspacesCount,
    workspacesTotal,
    seatGuardrailMax: membersTotal + 1,
  };
}

/**
 * Reconcile org storage bytes from AssetFile table
 */
async function reconcileOrgStorage(orgId) {
  const result = await prisma.assetFile.aggregate({
    _sum: { sizeBytes: true },
    where: {
      asset: {
        orgId,
        status: { not: 'permanently_deleted' },
      },
    },
  });

  const actualBytes = BigInt(result._sum.sizeBytes || 0);

  await prisma.organization.update({
    where: { id: orgId },
    data: { storageUsedBytes: actualBytes },
  });

  return { orgId, storageUsedBytes: Number(actualBytes) };
}

module.exports = {
  assertQuotaAvailable,
  recordStorageDelta,
  recordBandwidth,
  recordTransaction,
  getUsageSummary,
  reconcileOrgStorage,
};
