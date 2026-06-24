import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import os from 'os';
// @ts-ignore
import B2StorageService from './b2-storage.cjs';

// 1. Initialize DB and Cache connections (reusing config)
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
});

const prisma = new PrismaClient();

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

console.log('🚀 Noah Media Compression Worker is starting...');

// 2. Define the unified job processor function
const processCompressionJob = async (job: Job) => {
  const { mediaAssetId, key, preset } = job.data;
  console.log(`[Job ${job.id}] Submitting compression job to Coconut for asset: ${mediaAssetId}, key: ${key}`);

  // Update database status to "in_progress"
  await prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: { transcodingStatus: 'in_progress' },
  });

  try {
    const coconutApiKey = process.env.COCONUT_API_KEY || '';
    if (!coconutApiKey) {
      throw new Error("COCONUT_API_KEY is not set in the .env file!");
    }

    // Generate a Presigned GET URL so Coconut can read the raw file
    const sourceUrl = await b2Storage.getPresignedUrl(key, 86400); // URL valid for 24 hours

    // Generate a Presigned PUT URL for the output so Coconut can directly upload it
    const outputUrl = await b2Storage.getPresignedPutUrl(key, 86400); // URL valid for 24 hours

    // Pass the webhook URL so Coconut tells us when it's done
    const webhookHost = process.env.WEBHOOK_HOST || 'https://562546aa1bd524.lhr.life';
    const webhookUrl = `${webhookHost}/api/media/webhooks/coconut?assetId=${mediaAssetId}`;

    // Send API request to Coconut v2 using standard fetch to avoid SDK silent errors
    const response = await fetch('https://api.coconut.co/v2/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(coconutApiKey + ':').toString('base64')}`
      },
      body: JSON.stringify({
        input: { url: sourceUrl },
        outputs: {
          'mp4:1080p': {
            url: outputUrl
          }
        },
        notification: {
          type: 'http',
          url: webhookUrl
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Coconut API failed with status ${response.status}: ${errText}`);
    }

    const jobData = await response.json();
    console.log(`[Job ${job.id}] Successfully submitted to Coconut. Coconut Job ID: ${jobData.id}. Worker is now free!`);

  } catch (error: any) {
    console.error(`[Job ${job.id}] Error submitting to Coconut:`, error.message);

    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { transcodingStatus: 'failed', status: 'failed' },
    }).catch((dbErr) => console.error('Failed to write failure status to DB:', dbErr));

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
