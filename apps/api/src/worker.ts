import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';

import path from 'path';
import fs from 'fs';
import os from 'os';
// @ts-ignore
import B2StorageService from './b2-storage.cjs';
import { v4 as uuidv4 } from 'uuid';
import './ai-worker.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getB2Storage } = require('./services/b2Config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getCoconutConfig } = require('./services/coconutConfig');

/** Lazily-resolved B2 storage (creds from .env in dev, AWS Secrets Manager in all other envs) */
async function b2(): Promise<InstanceType<typeof B2StorageService>> { return getB2Storage(B2StorageService); }

// 1. Initialize DB and Cache connections (reusing config)
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

redisConnection.on('error', (err) => {
  process.stdout.write(`[Worker] ✗ Redis error: ${err.message}\n`);
});
redisConnection.on('reconnecting', () => {
  process.stdout.write(`[Worker] ⚠ Redis lost connection — reconnecting...\n`);
});

// @ts-ignore
const prisma = require('./utils/prisma.js');

process.stdout.write(`[Worker] Noah Media Compression Worker started\n`);

// 2. Define the unified job processor function
const processCompressionJob = async (job: Job) => {
  const { assetId, key, preset } = job.data;
  process.stdout.write(`[Worker] ▶ Job ${job.id} received — assetId=${assetId}\n`);

  // Update database status to "processing" (New Architecture)
  if (assetId) {
    try {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { status: 'processing' }
      });
    } catch (dbErr: any) {
      process.stdout.write(`[Worker] ⚠ Job ${job.id} — Failed to set DB status to processing: ${dbErr.message}\n`);
    }
  }

  try {
    const { apiKey: coconutApiKey } = await getCoconutConfig();
    if (!coconutApiKey) {
      throw new Error("COCONUT_API_KEY is not configured in AWS Secrets Manager or .env!");
    }

    const asset = assetId ? await prisma.asset.findUnique({
      where: { id: assetId },
      include: { metadata: true }
    }) : null;

    const isAudio = asset?.type === 'audio';

// Duration limit check removed to support long videos on paid Coconut accounts.

    // Generate a Presigned GET URL so Coconut can read the raw file
    const _b2 = await b2();
    const sourceUrl = await _b2.getPresignedUrl(key, 86400); // URL valid for 24 hours

    // Generate compressed key by replacing 'raw-' with 'compressed-'
    const parts = key.split('/');
    const filename = parts.pop() || '';
    const compressedFilename = filename.startsWith('raw-') ? filename.replace('raw-', 'compressed-') : `compressed-${filename}`;

    // Swap extension to .mp3 for audio proxy files
    const proxyFilename = isAudio
      ? (compressedFilename.replace(/\.[^/.]+$/, "") + ".mp3")
      : compressedFilename;
      
    // Build the final compressed key (keeping it in the same directory as the raw file)
    const compressedKey = parts.length > 0
      ? `${parts.join('/')}/${proxyFilename}`
      : proxyFilename;

    // Persist the deterministic compressed key in the Asset record
    await prisma.asset.update({
      where: { id: assetId },
      data: { compressedKey: compressedKey }
    }).catch((err: any) => process.stdout.write(`[Worker] ⚠ Job ${job.id} — Failed to save compressedKey: ${err.message}\n`));

    const outputUrl = await _b2.getPresignedPutUrl(compressedKey, 86400);

    let outputs: any = {};
    if (isAudio) {
      outputs = {
        'mp3': { url: outputUrl }
      };
    } else {
      const thumbUrl1 = await _b2.getPresignedPutUrl(`${compressedKey}_thumb1.jpg`, 86400);
      const thumbUrl2 = await _b2.getPresignedPutUrl(`${compressedKey}_thumb2.jpg`, 86400);
      const thumbUrl3 = await _b2.getPresignedPutUrl(`${compressedKey}_thumb3.jpg`, 86400);
      const thumbUrl4 = await _b2.getPresignedPutUrl(`${compressedKey}_thumb4.jpg`, 86400);
      const thumbUrl5 = await _b2.getPresignedPutUrl(`${compressedKey}_thumb5.jpg`, 86400);

      const technicalSpecs = asset?.metadata?.technicalSpecs as any;
      const fileSizeBytes = job.data.fileSizeBytes || Number(technicalSpecs?.sizeBytes || technicalSpecs?.fileSize || 0);
      const isMassiveFile = fileSizeBytes >= 800 * 1024 * 1024; // >= 800MB
      const isLargeFile = fileSizeBytes >= 300 * 1024 * 1024; // >= 300MB
      
      const w = parseInt(technicalSpecs?.width, 10);
      const h = parseInt(technicalSpecs?.height, 10);
      const is4KOrAbove = !isNaN(w) && (w > 3840 || h > 2160);
      const is2KOrAbove = !isNaN(w) && (w > 1920 || h > 1080);

      let formatKey = 'mp4';
      if (isMassiveFile || is4KOrAbove) {
        formatKey = 'mp4:720p';
      } else if (isLargeFile || is2KOrAbove) {
        formatKey = 'mp4:1080p';
      }

      outputs = {
        [formatKey]: { url: outputUrl },
        'jpg:300x#10%': { url: thumbUrl1 },
        'jpg:300x#30%': { url: thumbUrl2 },
        'jpg:300x#50%': { url: thumbUrl3 },
        'jpg:300x#70%': { url: thumbUrl4 },
        'jpg:300x#90%': { url: thumbUrl5 }
      };
    }

    // Pass the webhook URL so Coconut tells us when it's done
    const webhookHost = process.env.WEBHOOK_HOST || 'https://qa.noahcloud.ai';
    const webhookUrl = `${webhookHost}/api/media/webhooks/coconut?newAssetId=${assetId}&compressedKey=${encodeURIComponent(compressedKey)}`;

    // Send API request to Coconut v2 using standard fetch to avoid SDK silent errors
    const response = await fetch('https://api.coconut.co/v2/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(coconutApiKey + ':').toString('base64')}`
      },
      body: JSON.stringify({
        input: { url: sourceUrl },
        outputs,
        notification: {
          type: 'http',
          url: webhookUrl,
          events: true
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Coconut API failed with status ${response.status}: ${errText}`);
    }

    const jobData = await response.json();
    process.stdout.write(`[Worker] ✓ Job ${job.id} submitted to Coconut (CoconutJobId=${jobData.id})\n`);

    if (assetId && jobData.id) {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { jobId: jobData.id.toString() }
      }).catch((err: any) => process.stdout.write(`[Worker] ⚠ Job ${job.id} — Failed to save Coconut Job ID to DB: ${err.message}\n`));
    }

  } catch (error: any) {
    process.stdout.write(
      `[Worker] ✗ Job ${job.id} FAILED\n` +
      `  assetId=${assetId}\n` +
      `  error=${error.message}\n` +
      `  stack=${error.stack || 'n/a'}\n`
    );

    if (assetId) {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { status: 'failed' }
      }).catch((dbErr: any) => process.stdout.write(`[Worker] ⚠ Failed to write failure status to transcode job: ${dbErr.message}\n`));

      await prisma.asset.update({
        where: { id: assetId },
        data: { status: 'failed' }
      }).catch((dbErr: any) => process.stdout.write(`[Worker] ⚠ Failed to write failure status to asset: ${dbErr.message}\n`));
    }

    throw error;
  }
};

// 3. Initialize the "Fast" Queue Worker
const fastWorker = new Worker('compression-jobs', processCompressionJob, {
  connection: redisConnection,
  concurrency: 5 // Can process 5 small videos simultaneously
});

// 4. Initialize the "Heavy" Queue Worker
const heavyWorker = new Worker('compression-jobs-heavy', processCompressionJob, {
  connection: redisConnection,
  concurrency: 1 // Can only process 1 massive video at a time to prevent crashing
});

// Attach event listeners for errors / failures
[fastWorker, heavyWorker].forEach(worker => {
  worker.on('failed', (job, err) => {
    process.stdout.write(`[Worker] ✗ Job ${job?.id} failed on queue ${worker.name}: ${err.message}\n`);
  });

  worker.on('error', (err) => {
    process.stdout.write(`[Worker] ✗ Worker error on queue ${worker.name}: ${err.message}\n`);
  });

  worker.on('stalled', (jobId) => {
    process.stdout.write(`[Worker] ⚠ Job ${jobId} stalled on queue ${worker.name} — will be retried\n`);
  });
});
