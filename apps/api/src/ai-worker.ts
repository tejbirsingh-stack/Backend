import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
// @ts-ignore
import B2StorageService from './b2-storage.cjs';
import { transcribeProxy } from './services/ai/assemblyai.js';
import { embedTranscriptForAsset } from './services/ai/embedTranscript.js';
import { highlightTranscriptForAsset } from './services/ai/highlightTranscript.js';
// CJS entitlement helper
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAiEnabledForOrg } = require('./services/ai/aiEntitlement.js');

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

type AnalyzeJobData = {
  assetId: string;
  orgId?: string;
  force?: boolean;
};

async function processAsrStep(assetId: string, orgId: string, force: boolean) {
  const existingCount = await prisma.aiTranscriptSegment.count({ where: { assetId } });
  if (existingCount > 0 && !force) {
    return 'skipped';
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { files: true },
  });
  if (!asset) {
    throw new Error('Asset not found');
  }

  if (asset.type !== 'video' && asset.type !== 'audio') {
    return 'skipped';
  }

  const proxy = asset.files.find((f) => f.fileClass === 'proxy');
  if (!proxy?.filePath) {
    throw new Error('Proxy AssetFile missing; cannot transcribe original');
  }

  const proxyUrl = await b2Storage.getPresignedUrl(proxy.filePath, 86400);
  if (!proxyUrl) {
    throw new Error('Failed to generate proxy presigned URL');
  }

  const segments = await transcribeProxy(proxyUrl);

  await prisma.$transaction(async (tx) => {
    await tx.aiTranscriptSegment.deleteMany({ where: { assetId } });
    if (segments.length === 0) {
      return;
    }
    await tx.aiTranscriptSegment.createMany({
      data: segments.map((s) => ({
        assetId,
        orgId,
        text: s.text,
        startMs: s.startMs,
        endMs: s.endMs,
        ordinal: s.ordinal,
      })),
    });
  });

  return 'completed';
}

export async function processAiAnalyzeJob(job: Job<AnalyzeJobData>) {
  const { assetId, force = false } = job.data;
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }
  const orgId = job.data.orgId || asset.orgId;
  if (!orgId) {
    throw new Error(`Asset ${assetId} has no orgId and none provided in job`);
  }

  const analysisJob = await prisma.aiAnalysisJob.upsert({
    where: { assetId },
    create: {
      assetId,
      orgId,
      status: 'processing',
      force,
      steps: { asr: 'queued', highlights: 'queued', embeddings: 'queued' },
    },
    update: {
      status: 'processing',
      force,
      error: null,
      steps: { asr: 'queued', highlights: 'queued', embeddings: 'queued' },
    },
  });

  const steps: Record<string, string> = {
    asr: 'skipped',
    people_scenes: 'skipped',
    highlights: 'skipped',
    embeddings: 'skipped',
  };
  const stepErrors: string[] = [];

  try {
    if (!(await isAiEnabledForOrg(orgId, prisma))) {
      await prisma.aiAnalysisJob.update({
        where: { id: analysisJob.id },
        data: { status: 'completed', steps, error: null },
      });
      return;
    }

    steps.asr = await processAsrStep(assetId, orgId, force);
    if (steps.asr === 'completed' || steps.asr === 'skipped') {
      try {
        steps.highlights = await highlightTranscriptForAsset(prisma, assetId, orgId, force);
      } catch (highlightErr: any) {
        steps.highlights = 'failed';
        const msg = highlightErr?.message || String(highlightErr);
        stepErrors.push(`highlights: ${msg}`);
        console.error('[AI] highlights step failed:', msg);
      }
      try {
        steps.embeddings = await embedTranscriptForAsset(prisma, assetId, orgId, force);
      } catch (embedErr: any) {
        steps.embeddings = 'failed';
        const msg = embedErr?.message || String(embedErr);
        const meta =
          embedErr?.meta !== undefined ? ` meta=${JSON.stringify(embedErr.meta)}` : '';
        stepErrors.push(`embeddings: ${msg}`);
        console.error('[AI] embeddings step failed:', msg + meta);
      }
    }
    await prisma.aiAnalysisJob.update({
      where: { id: analysisJob.id },
      data: {
        status: 'completed',
        steps,
        error: stepErrors.length > 0 ? stepErrors.join('; ') : null,
      },
    });
  } catch (err: any) {
    steps.asr = 'failed';
    await prisma.aiAnalysisJob.update({
      where: { id: analysisJob.id },
      data: {
        status: 'failed',
        steps,
        error: err?.message || 'AI analysis failed',
      },
    });
    throw err;
  }
}

const aiWorker = new Worker('ai-analyze', processAiAnalyzeJob, {
  connection: redisConnection,
  concurrency: 2,
});

aiWorker.on('failed', (job, err) => {
  console.error(`[AI] Job ${job?.id} failed:`, err.message);
});

aiWorker.on('completed', (job) => {
  console.log(`[AI] Job ${job.id} completed`);
});

console.log('NOAH AI worker listening on queue ai-analyze');

export { aiWorker };
