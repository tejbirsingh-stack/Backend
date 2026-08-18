import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import os from 'os';
// @ts-ignore
import B2StorageService from './b2-storage.cjs';
import { v4 as uuidv4 } from 'uuid';

// 1. Initialize DB and Cache connections (reusing config)
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
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

console.log(' Noah Media Compression Worker is starting...');

// 2. Define the unified job processor function
const processCompressionJob = async (job: Job) => {
  const { assetId, key, preset } = job.data;
  console.log(`[Job ${job.id}] Submitting compression job to Coconut for newAsset: ${assetId}, key: ${key}`);

  // Update database status to "processing" (New Architecture)
  if (assetId) {
    await prisma.transcodeJob.updateMany({
      where: { assetId: assetId, provider: "coconut" },
      data: { status: 'processing' }
    });
  }

  try {
    const coconutApiKey = process.env.COCONUT_API_KEY || '';
    if (!coconutApiKey) {
      throw new Error("COCONUT_API_KEY is not set in the .env file!");
    }

    const asset = assetId ? await prisma.asset.findUnique({
      where: { id: assetId },
      include: { metadata: true }
    }) : null;

    const isAudio = asset?.type === 'audio';

// Apply duration limit only for video assets (audio is exempt)
const maxDurationStr = process.env.COCONUT_MAX_DURATION_SECONDS;
if (!isAudio && maxDurationStr && assetId && asset) {
      const maxDuration = parseInt(maxDurationStr, 10);
      if (!isNaN(maxDuration)) {
        try {
          const technicalSpecs = asset.metadata?.technicalSpecs as any;
          const durationSeconds = technicalSpecs?.durationSeconds;
          if (durationSeconds && durationSeconds > maxDuration) {
            // console.log(`[Job ${job.id}] Asset duration ${durationSeconds}s exceeds limits of ${maxDuration}s. Skipping transcoding and marking as failed.`);
            // Compute the would‑be compressed key to clean up any stale file
            const partsTmp = key.split('/');
            const filenameTmp = partsTmp.pop() || '';
            const compressedFilenameTmp = filenameTmp.startsWith('raw-') ? filenameTmp.replace('raw-', 'compressed-') : `compressed-${filenameTmp}`;
            const compressedKeyTmp = partsTmp.length > 0 ? `${partsTmp.join('/')}/${compressedFilenameTmp}` : compressedFilenameTmp;
            // Delete possible stale object
            try { await b2Storage.deleteFile(compressedKeyTmp); } catch (e) { console.error(`[Job ${job.id}] Failed to delete stale compressed file:`, (e as any).message); }
            await prisma.transcodeJob.updateMany({
              where: { assetId: assetId, provider: "coconut" },
              data: { status: 'failed' }
            });
            await prisma.asset.update({
              where: { id: assetId },
              data: { status: 'failed', compressedKey: null }
            });
            return;
          }
        } catch (dbErr: any) {
          console.error(`[Job ${job.id}] Failed to check asset duration:`, dbErr.message);
        }
      }
    }

    // Generate a Presigned GET URL so Coconut can read the raw file
    const sourceUrl = await b2Storage.getPresignedUrl(key, 86400); // URL valid for 24 hours

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
    }).catch(err => console.error(`[Job ${job.id}] Failed to save compressedKey:`, err.message));
    const outputUrl = await b2Storage.getPresignedPutUrl(compressedKey, 86400);

    let outputs: any = {};
    if (isAudio) {
      outputs = {
        'mp3': { url: outputUrl }
      };
    } else {
      const thumbUrl1 = await b2Storage.getPresignedPutUrl(`${compressedKey}_thumb1.jpg`, 86400);
      const thumbUrl2 = await b2Storage.getPresignedPutUrl(`${compressedKey}_thumb2.jpg`, 86400);
      const thumbUrl3 = await b2Storage.getPresignedPutUrl(`${compressedKey}_thumb3.jpg`, 86400);
      const thumbUrl4 = await b2Storage.getPresignedPutUrl(`${compressedKey}_thumb4.jpg`, 86400);
      const thumbUrl5 = await b2Storage.getPresignedPutUrl(`${compressedKey}_thumb5.jpg`, 86400);

      outputs = {
        'mp4': { url: outputUrl },
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
    console.log(`[Job ${job.id}] Successfully submitted to Coconut. Coconut Job ID: ${jobData.id}. Worker is now free!`);

    if (assetId && jobData.id) {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { jobId: jobData.id.toString() }
      }).catch(err => console.error(`[Job ${job.id}] Failed to save Job ID to db:`, err.message));
    }

  } catch (error: any) {
    console.error(`[Job ${job.id}] Error submitting to Coconut:`, error.message);

    if (assetId) {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { status: 'failed' }
      }).catch((dbErr) => console.error('Failed to write failure status to transcode job:', dbErr));

      await prisma.asset.update({
        where: { id: assetId },
        data: { status: 'failed' }
      }).catch((dbErr) => console.error('Failed to write failure status to asset:', dbErr));
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

// Attach event listeners
[fastWorker, heavyWorker].forEach(worker => {
  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed on queue ${worker.name}:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully on queue ${worker.name}`);
  });
});
