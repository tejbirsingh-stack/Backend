import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
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
  console.log(`[Job ${job.id}] Starting compression for asset: ${mediaAssetId}, key: ${key}`);

  // Update database status to "in_progress"
  await prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: { transcodingStatus: 'in_progress' },
  });

  // Use OS temp directory to avoid polluting project directories
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `noah-raw-${mediaAssetId}${path.extname(key)}`);
  const outputPath = path.join(tempDir, `noah-compressed-${mediaAssetId}.mp4`);

  try {
    // Step A: Download the raw file from Backblaze B2
    console.log(`[Job ${job.id}] Downloading raw file from B2 to ${inputPath}...`);
    await b2Storage.downloadFile(key, inputPath);

    // Step B: Run FFmpeg compression locally on the worker machine
    console.log(`[Job ${job.id}] Transcoding video...`);
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(inputPath);

      // Apply quality presets
      if (preset === 'high') {
        command = command.videoCodec('libx265').outputOptions(['-crf 27', '-preset veryfast']).audioCodec('aac').audioBitrate('128k');
      } else if (preset === 'low') {
        command = command.videoCodec('libx264').outputOptions(['-crf 32', '-preset superfast']).audioCodec('aac').audioBitrate('96k');
      } else {
        command = command.videoCodec('libx264').outputOptions(['-crf 29', '-preset veryfast']).audioCodec('aac').audioBitrate('128k');
      }

      command
        .on('end', () => {
          console.log(`[Job ${job.id}] Compression completed successfully`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[Job ${job.id}] FFmpeg transcoding error:`, err);
          reject(err);
        })
        .save(outputPath);
    });

    // Step C: Permanently delete the original raw file and its versions from B2 to prevent storage bloat
    console.log(`[Job ${job.id}] Permanently deleting original raw file versions of ${key} from B2...`);
    try {
      await b2Storage.permanentlyDeleteFile(key);
    } catch (delErr: any) {
      console.warn(`[Job ${job.id}] Non-critical: Failed to permanently delete raw B2 file versions:`, delErr.message);
    }

    // Step C2: Upload the compressed file to B2
    console.log(`[Job ${job.id}] Uploading compressed file to B2 as ${key}...`);
    await b2Storage.uploadFile(outputPath, key);

    // Step D: Calculate compression metrics
    const originalStats = fs.statSync(inputPath);
    const compressedStats = fs.statSync(outputPath);
    const ratio = originalStats.size / compressedStats.size;

    console.log(`[Job ${job.id}] Original size: ${originalStats.size} bytes. Compressed size: ${compressedStats.size} bytes. Ratio: ${ratio.toFixed(2)}x`);

    // Step E: Update DB record
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        fileSize: compressedStats.size,
        compressionRatio: ratio,
        transcodingStatus: 'completed',
        status: 'ready',
      },
    });

    console.log(`[Job ${job.id}] Original file successfully replaced with compressed version in B2 and DB.`);

  } catch (error) {
    console.error(`[Job ${job.id}] Error in worker execution:`, error);
    
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { transcodingStatus: 'failed', status: 'failed' },
    }).catch((dbErr) => console.error('Failed to write failure status to DB:', dbErr));

    throw error;
  } finally {
    // Step G: Clean up local temporary files
    if (fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch {}
    }
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
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
