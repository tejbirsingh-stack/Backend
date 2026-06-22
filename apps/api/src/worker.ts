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

// 2. Initialize the BullMQ Worker
const worker = new Worker(
  'compression-jobs', // The queue name
  async (job: Job) => {
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

        // Apply quality presets (Using faster presets for much faster transcoding times)
        if (preset === 'high') {
          // H.265 high efficiency
          command = command
            .videoCodec('libx265')
            .outputOptions(['-crf 27', '-preset veryfast'])
            .audioCodec('aac')
            .audioBitrate('128k');
        } else if (preset === 'low') {
          // H.264 faster, lower quality
          command = command
            .videoCodec('libx264')
            .outputOptions(['-crf 32', '-preset superfast'])
            .audioCodec('aac')
            .audioBitrate('96k');
        } else {
          // Default: H.264 balanced quality
          command = command
            .videoCodec('libx264')
            .outputOptions(['-crf 29', '-preset veryfast'])
            .audioCodec('aac')
            .audioBitrate('128k');
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

      // Step C2: Upload the compressed file to B2, overwriting the original file key!
      console.log(`[Job ${job.id}] Uploading compressed file to B2 as ${key}...`);
      await b2Storage.uploadFile(outputPath, key);

      // Step D: Calculate compression metrics
      const originalStats = fs.statSync(inputPath);
      const compressedStats = fs.statSync(outputPath);
      const ratio = originalStats.size / compressedStats.size;

      console.log(`[Job ${job.id}] Original size: ${originalStats.size} bytes. Compressed size: ${compressedStats.size} bytes. Ratio: ${ratio.toFixed(2)}x`);

      // Step E: Update DB record with the new file size and transcoding status
      await prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: {
          fileSize: compressedStats.size,
          compressionRatio: ratio,
          transcodingStatus: 'completed',
          status: 'ready',
          // filePath remains exactly the same (key)
        },
      });

      // Step F: Job completed successfully
      console.log(`[Job ${job.id}] Original file successfully replaced with compressed version in B2 and DB.`);

    } catch (error) {
      console.error(`[Job ${job.id}] Error in worker execution:`, error);
      
      // Mark job as failed in database
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
  },
  { connection: redisConnection }
);

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});
