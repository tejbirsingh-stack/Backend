import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
// @ts-ignore
import B2StorageService from './b2-storage.cjs';
import { transcribeProxy } from './services/ai/assemblyai.js';
import { indexProxyWithVideoIndexer } from './services/ai/azureVideoIndexer.js';
import { embedTranscriptForAsset } from './services/ai/embedTranscript.js';
import { embedSceneInsightsForAsset } from './services/ai/embedSceneInsights.js';
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

type AiFeature = 'asr' | 'highlights' | 'embeddings' | 'people_scenes';

const ALL_AI_FEATURES: AiFeature[] = ['asr', 'highlights', 'embeddings', 'people_scenes'];

type AnalyzeJobData = {
  assetId: string;
  orgId?: string;
  force?: boolean;
  features?: AiFeature[];
};

function resolveFeatures(raw: unknown, assetType: string): AiFeature[] {
  const allowed = new Set<string>(ALL_AI_FEATURES);
  let list = Array.isArray(raw)
    ? (raw.filter((f): f is AiFeature => typeof f === 'string' && allowed.has(f)) as AiFeature[])
    : [...ALL_AI_FEATURES];

  if (list.length === 0) {
    list = [...ALL_AI_FEATURES];
  }

  // Highlights/embeddings can use an existing transcript without selecting asr again.

  if (assetType === 'audio') {
    list = list.filter((f) => f !== 'people_scenes');
  }

  return [...new Set(list)];
}

function stepsTemplate(features: AiFeature[], value: 'queued' | 'skipped'): Record<string, string> {
  const selected = new Set(features);
  return {
    asr: selected.has('asr') ? value : 'skipped',
    people_scenes: selected.has('people_scenes') ? value : 'skipped',
    highlights: selected.has('highlights') ? value : 'skipped',
    embeddings: selected.has('embeddings') ? value : 'skipped',
  };
}

async function getProxyUrl(assetId: string): Promise<{ proxyUrl: string; title: string; type: string }> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { files: true },
  });
  if (!asset) {
    throw new Error('Asset not found');
  }
  const proxy = asset.files.find((f) => f.fileClass === 'proxy');
  const original = asset.files.find((f) => f.fileClass === 'original');
  const mediaFile =
    proxy ||
    (asset.type === 'audio' ? original : null);
  if (!mediaFile?.filePath) {
    throw new Error('Proxy AssetFile missing; cannot run AI on original');
  }
  const proxyUrl = await b2Storage.getPresignedUrl(mediaFile.filePath, 86400);
  if (!proxyUrl) {
    throw new Error('Failed to generate proxy presigned URL');
  }
  return { proxyUrl, title: asset.title || assetId, type: asset.type };
}

async function processAsrStep(assetId: string, orgId: string, force: boolean) {
  const existingCount = await prisma.aiTranscriptSegment.count({ where: { assetId } });
  if (existingCount > 0 && !force) {
    return 'skipped';
  }

  const { proxyUrl, type } = await getProxyUrl(assetId);
  if (type !== 'video' && type !== 'audio') {
    return 'skipped';
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

async function processPeopleScenesStep(assetId: string, orgId: string, force: boolean) {
  const existingPeople = await prisma.aiAssetPersonAppearance.count({ where: { assetId } });
  const existingScenes = await prisma.aiSceneInsight.count({ where: { assetId } });
  if ((existingPeople > 0 || existingScenes > 0) && !force) {
    return 'skipped';
  }

  const { proxyUrl, title, type } = await getProxyUrl(assetId);
  if (type !== 'video') {
    return 'skipped';
  }

  const indexed = await indexProxyWithVideoIndexer(proxyUrl, title);

  await prisma.$transaction(async (tx) => {
    await tx.aiAssetPersonAppearance.deleteMany({ where: { assetId } });
    await tx.aiSceneInsight.deleteMany({ where: { assetId } });

    if (indexed.people.length > 0) {
      await tx.aiAssetPersonAppearance.createMany({
        data: indexed.people.map((p) => ({
          assetId,
          orgId,
          viFaceId: p.viFaceId,
          displayLabel: p.displayLabel,
          startMs: p.startMs,
          endMs: p.endMs,
          thumbnailUrl: p.thumbnailUrl,
          ordinal: p.ordinal,
        })),
      });
    }

    if (indexed.scenes.length > 0) {
      await tx.aiSceneInsight.createMany({
        data: indexed.scenes.map((s) => ({
          assetId,
          orgId,
          label: s.label,
          description: s.description,
          startMs: s.startMs,
          endMs: s.endMs,
          confidence: s.confidence,
          ordinal: s.ordinal,
        })),
      });
    }
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

  const features = resolveFeatures(job.data.features, asset.type);
  const wantAsr = features.includes('asr');
  const wantPeople = features.includes('people_scenes');
  const wantHighlights = features.includes('highlights');
  const wantEmbeddings = features.includes('embeddings');

  const existingJob = await prisma.aiAnalysisJob.findUnique({ where: { assetId } });
  const prevSteps =
    existingJob?.steps && typeof existingJob.steps === 'object' && !Array.isArray(existingJob.steps)
      ? (existingJob.steps as Record<string, string>)
      : {};

  const queuedSteps = {
    asr: wantAsr ? 'queued' : prevSteps.asr === 'completed' ? 'completed' : prevSteps.asr || 'skipped',
    people_scenes: wantPeople
      ? 'queued'
      : prevSteps.people_scenes === 'completed'
        ? 'completed'
        : prevSteps.people_scenes || 'skipped',
    highlights: wantHighlights
      ? 'queued'
      : prevSteps.highlights === 'completed'
        ? 'completed'
        : prevSteps.highlights || 'skipped',
    embeddings: wantEmbeddings
      ? 'queued'
      : prevSteps.embeddings === 'completed'
        ? 'completed'
        : prevSteps.embeddings || 'skipped',
  };

  const analysisJob = await prisma.aiAnalysisJob.upsert({
    where: { assetId },
    create: {
      assetId,
      orgId,
      status: 'processing',
      force,
      steps: queuedSteps,
    },
    update: {
      status: 'processing',
      force,
      error: null,
      steps: queuedSteps,
    },
  });

  const steps: Record<string, string> = { ...queuedSteps };
  // Reset only the features this job will run.
  if (wantAsr) steps.asr = 'skipped';
  if (wantPeople) steps.people_scenes = 'skipped';
  if (wantHighlights) steps.highlights = 'skipped';
  if (wantEmbeddings) steps.embeddings = 'skipped';
  const stepErrors: string[] = [];

  try {
    if (!(await isAiEnabledForOrg(orgId, prisma))) {
      await prisma.aiAnalysisJob.update({
        where: { id: analysisJob.id },
        data: { status: 'completed', steps, error: null },
      });
      return;
    }

    const [asrSettled, peopleSettled] = await Promise.allSettled([
      wantAsr ? processAsrStep(assetId, orgId, force) : Promise.resolve('skipped' as const),
      wantPeople ? processPeopleScenesStep(assetId, orgId, force) : Promise.resolve('skipped' as const),
    ]);

    if (wantAsr) {
      if (asrSettled.status === 'fulfilled') {
        steps.asr = asrSettled.value;
      } else {
        steps.asr = 'failed';
        const msg = asrSettled.reason?.message || String(asrSettled.reason);
        stepErrors.push(`asr: ${msg}`);
        console.error('[AI] asr step failed:', msg);
      }
    }

    if (wantPeople) {
      if (peopleSettled.status === 'fulfilled') {
        steps.people_scenes = peopleSettled.value;
        if (peopleSettled.value === 'completed' || peopleSettled.value === 'skipped') {
          try {
            await embedSceneInsightsForAsset(prisma, assetId, orgId, force);
          } catch (sceneEmbedErr: any) {
            const msg = sceneEmbedErr?.message || String(sceneEmbedErr);
            stepErrors.push(`scene_embeddings: ${msg}`);
            console.error('[AI] scene embeddings failed:', msg);
          }
        }
      } else {
        steps.people_scenes = 'failed';
        const msg = peopleSettled.reason?.message || String(peopleSettled.reason);
        stepErrors.push(`people_scenes: ${msg}`);
        console.error('[AI] people_scenes step failed:', msg);
      }
    }

    if (wantPeople) {
      if (peopleSettled.status === 'fulfilled') {
        steps.people_scenes = peopleSettled.value;
        if (peopleSettled.value === 'completed' || peopleSettled.value === 'skipped') {
          try {
            await embedSceneInsightsForAsset(prisma, assetId, orgId, force);
          } catch (sceneEmbedErr: any) {
            const msg = sceneEmbedErr?.message || String(sceneEmbedErr);
            stepErrors.push(`scene_embeddings: ${msg}`);
            console.error('[AI] scene embeddings failed:', msg);
          }
        }
      } else {
        steps.people_scenes = 'failed';
        const msg = peopleSettled.reason?.message || String(peopleSettled.reason);
        stepErrors.push(`people_scenes: ${msg}`);
        console.error('[AI] people_scenes step failed:', msg);
      }
    }

    let transcriptReady =
      wantAsr && (steps.asr === 'completed' || steps.asr === 'skipped');
    if (!transcriptReady && (wantHighlights || wantEmbeddings) && !wantAsr) {
      const segmentCount = await prisma.aiTranscriptSegment.count({ where: { assetId } });
      transcriptReady = segmentCount > 0;
    }

    if (transcriptReady) {
      if (wantHighlights) {
        try {
          steps.highlights = await highlightTranscriptForAsset(prisma, assetId, orgId, force);
        } catch (highlightErr: any) {
          steps.highlights = 'failed';
          const msg = highlightErr?.message || String(highlightErr);
          stepErrors.push(`highlights: ${msg}`);
          console.error('[AI] highlights step failed:', msg);
        }
      }
      if (wantEmbeddings) {
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
    } else if (!wantAsr) {
      // Highlights/embeddings already marked skipped when not selected.
    } else {
      if (wantHighlights) steps.highlights = 'skipped';
      if (wantEmbeddings) steps.embeddings = 'skipped';
    }

    const primaryFailed =
      (wantAsr ? steps.asr === 'failed' : true) &&
      (wantPeople ? steps.people_scenes === 'failed' : true) &&
      (wantAsr || wantPeople);
    await prisma.aiAnalysisJob.update({
      where: { id: analysisJob.id },
      data: {
        status: primaryFailed ? 'failed' : 'completed',
        steps,
        error: stepErrors.length > 0 ? stepErrors.join('; ') : null,
      },
    });

    if (primaryFailed) {
      throw new Error(stepErrors.join('; ') || 'AI analysis failed');
    }
  } catch (err: any) {
    if (wantAsr && steps.asr !== 'failed' && (!wantPeople || steps.people_scenes !== 'failed')) {
      steps.asr = steps.asr === 'skipped' && wantAsr ? 'failed' : steps.asr;
    }
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
