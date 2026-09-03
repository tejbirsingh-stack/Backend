const { Queue } = require('bullmq');
const Redis = require('ioredis');

const queueRedisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

const aiAnalyzeQueue = new Queue('ai-analyze', {
  connection: queueRedisConnection,
});

const { isAiEnabledFromEnv, isAiEnabledForOrg } = require('./aiEntitlement');
const prisma = require('../../utils/prisma');

const ALL_AI_FEATURES = ['asr', 'highlights', 'embeddings', 'people_scenes'];

function isAiEnabled() {
  return isAiEnabledFromEnv();
}

function normalizeAiFeatures(features, { assetType } = {}) {
  const allowed = new Set(ALL_AI_FEATURES);
  let list = Array.isArray(features)
    ? features.filter((f) => typeof f === 'string' && allowed.has(f))
    : [...ALL_AI_FEATURES];

  if (list.length === 0) {
    list = [...ALL_AI_FEATURES];
  }

  // Do not auto-inject asr here: the worker will use an existing transcript when
  // highlights/embeddings are requested without asr (additive "Add AI features" runs).

  if (assetType === 'audio') {
    list = list.filter((f) => f !== 'people_scenes');
  }

  return [...new Set(list)];
}

function stepsFromFeatures(features) {
  const selected = new Set(features);
  return {
    asr: selected.has('asr') ? 'queued' : 'skipped',
    people_scenes: selected.has('people_scenes') ? 'queued' : 'skipped',
    highlights: selected.has('highlights') ? 'queued' : 'skipped',
    embeddings: selected.has('embeddings') ? 'queued' : 'skipped',
  };
}

function featuresFromSteps(steps) {
  if (!steps || typeof steps !== 'object') {
    return [];
  }
  return ALL_AI_FEATURES.filter((feature) => steps[feature] === 'queued');
}

async function enqueueAiAnalyze({ assetId, orgId, force = false, features, assetType }) {
  if (!assetId) {
    throw new Error('assetId is required to enqueue AI analysis');
  }

  if (!(await isAiEnabledForOrg(orgId, prisma))) {
    return false;
  }

  const normalizedFeatures = normalizeAiFeatures(features, { assetType });

  await aiAnalyzeQueue.add(
    'analyze',
    { assetId, orgId, force: Boolean(force), features: normalizedFeatures },
    {
      jobId: force ? `ai-analyze-${assetId}-${Date.now()}` : `ai-analyze-${assetId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
    },
  );

  return true;
}

/**
 * Store upload-time AI feature choices until proxy/original media is ready.
 */
async function persistUploadAiRequest(prismaClient, { assetId, orgId, assetType, aiFeatures }) {
  if (!assetId || !orgId) {
    return false;
  }
  if (assetType !== 'video' && assetType !== 'audio') {
    return false;
  }
  if (!Array.isArray(aiFeatures) || aiFeatures.length === 0) {
    return false;
  }
  if (!(await isAiEnabledForOrg(orgId, prismaClient))) {
    return false;
  }

  const features = normalizeAiFeatures(aiFeatures, { assetType });
  if (features.length === 0) {
    return false;
  }

  await prismaClient.aiAnalysisJob.upsert({
    where: { assetId },
    create: {
      assetId,
      orgId,
      status: 'awaiting_media',
      steps: stepsFromFeatures(features),
      force: false,
    },
    update: {
      status: 'awaiting_media',
      steps: stepsFromFeatures(features),
      error: null,
      force: false,
    },
  });

  return true;
}

/**
 * Start AI analysis for uploads that requested features at upload time.
 */
async function tryStartPendingUploadAi(prismaClient, assetId) {
  const job = await prismaClient.aiAnalysisJob.findUnique({
    where: { assetId },
    include: {
      asset: {
        include: { files: true },
      },
    },
  });

  if (!job || job.status !== 'awaiting_media' || !job.asset) {
    return false;
  }

  const { asset } = job;
  const proxy = asset.files.find((f) => f.fileClass === 'proxy');
  const original = asset.files.find((f) => f.fileClass === 'original');

  if (asset.type === 'video') {
    if (!proxy?.filePath) {
      return false;
    }
  } else if (asset.type === 'audio') {
    if (!proxy?.filePath && !original?.filePath) {
      return false;
    }
  } else {
    return false;
  }

  const features = featuresFromSteps(job.steps);
  if (features.length === 0) {
    await prismaClient.aiAnalysisJob.update({
      where: { assetId },
      data: { status: 'idle' },
    });
    return false;
  }

  await prismaClient.aiAnalysisJob.update({
    where: { assetId },
    data: { status: 'queued', error: null },
  });

  await enqueueAiAnalyze({
    assetId,
    orgId: job.orgId,
    force: false,
    features,
    assetType: asset.type,
  });

  return true;
}

module.exports = {
  aiAnalyzeQueue,
  isAiEnabled,
  isAiEnabledForOrg,
  ALL_AI_FEATURES,
  normalizeAiFeatures,
  stepsFromFeatures,
  featuresFromSteps,
  enqueueAiAnalyze,
  persistUploadAiRequest,
  tryStartPendingUploadAi,
};
