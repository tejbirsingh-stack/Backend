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

async function enqueueAiAnalyze({ assetId, orgId, force = false, features }) {
  if (!assetId) {
    throw new Error('assetId is required to enqueue AI analysis');
  }

  if (!(await isAiEnabledForOrg(orgId, prisma))) {
    return false;
  }

  const normalizedFeatures = normalizeAiFeatures(features);

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

module.exports = {
  aiAnalyzeQueue,
  isAiEnabled,
  isAiEnabledForOrg,
  ALL_AI_FEATURES,
  normalizeAiFeatures,
  stepsFromFeatures,
  enqueueAiAnalyze,
};
