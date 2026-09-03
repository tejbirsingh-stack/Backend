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

// 1. Initialize DB and Cache connections (reusing config)
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
});

// @ts-ignore
const prisma = require('./utils/prisma.js');

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

// Duration limit check removed to support long videos on paid Coconut accounts.

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
    }).catch((err: any) => console.error(`[Job ${job.id}] Failed to save compressedKey:`, err.message));
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
    console.log(`[Job ${job.id}] Successfully submitted to Coconut. Coconut Job ID: ${jobData.id}. Worker is now free!`);

    if (assetId && jobData.id) {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { jobId: jobData.id.toString() }
      }).catch((err: any) => console.error(`[Job ${job.id}] Failed to save Job ID to db:`, err.message));
    }

  } catch (error: any) {
    console.error(`[Job ${job.id}] Error submitting to Coconut:`, error.message);

    if (assetId) {
      await prisma.transcodeJob.updateMany({
        where: { assetId: assetId, provider: "coconut" },
        data: { status: 'failed' }
      }).catch((dbErr: any) => console.error('Failed to write failure status to transcode job:', dbErr));

      await prisma.asset.update({
        where: { id: assetId },
        data: { status: 'failed' }
      }).catch((dbErr: any) => console.error('Failed to write failure status to asset:', dbErr));
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
