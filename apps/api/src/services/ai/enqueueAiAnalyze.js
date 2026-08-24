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

function isAiEnabled() {
  return isAiEnabledFromEnv();
}

async function enqueueAiAnalyze({ assetId, orgId, force = false }) {
  if (!assetId) {
    throw new Error('assetId is required to enqueue AI analysis');
  }

  if (!(await isAiEnabledForOrg(orgId, prisma))) {
    return false;
  }

  await aiAnalyzeQueue.add(
    'analyze',
    { assetId, orgId, force: Boolean(force) },
    {
      jobId: force ? `ai-analyze-${assetId}-${Date.now()}` : `ai-analyze-${assetId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
    },
  );
}

module.exports = {
  aiAnalyzeQueue,
  isAiEnabled,
  isAiEnabledForOrg,
  enqueueAiAnalyze,
};
