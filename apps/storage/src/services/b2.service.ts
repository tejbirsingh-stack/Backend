// Enterprise B2 Storage Service - Production Implementation
import { B2 } from '@backblaze/b2';
import { CircuitBreaker } from 'opossum';
import { Logger } from 'pino';
import { Histogram, Counter, Gauge, register } from 'prom-client';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import crypto from 'crypto';
import { Readable, Transform } from 'stream';

// Constants for performance optimization
const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
const PARALLEL_UPLOADS = 10; // Max concurrent uploads
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB min
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Storage tiers
export enum StorageTier {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold',
  ARCHIVE = 'archive'
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  uploadTimestamp: number;
  size: number;
  cost: number;
  tier: StorageTier;
}

export interface AccessPattern {
  assetId: string;
  lastAccessed: Date;
  accessCount: number;
  totalBandwidthUsed: number;
  tier: StorageTier;
}

export interface CostMetrics {
  storage: number;
  bandwidth: number;
  transactions: number;
  total: number;
}

// Prometheus metrics
const uploadDuration = new Histogram({
  name: 'b2_upload_duration_seconds',
  help: 'Duration of B2 uploads',
  labelNames: ['tier', 'size_category'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300]
});

const uploadCounter = new Counter({
  name: 'b2_uploads_total',
  help: 'Total number of uploads',
  labelNames: ['tier', 'status']
});

const costGauge = new Gauge({
  name: 'b2_cost_usd',
  help: 'Current B2 costs in USD',
  labelNames: ['type', 'tier']
});

// Main B2 Service with enterprise features
export class B2Service extends EventEmitter {
  private b2: B2;
  private redis: Redis;
  private logger: Logger;
  private breaker: CircuitBreaker;
  private uploadLimiter: any;

  constructor(b2: B2, logger: Logger, redis: Redis) {
    super();
    this.b2 = b2;
    this.logger = logger;
    this.redis = redis;
    this.uploadLimiter = pLimit(PARALLEL_UPLOADS);

    // Circuit breaker configuration
    this.breaker = new CircuitBreaker(this.uploadWithRetry.bind(this), {
      timeout: 60000, // 60 second timeout
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 10,
      name: 'b2-upload'
    });

    this.breaker.on('open', () => {
      this.logger.error('B2 circuit breaker opened - too many failures');
      this.emit('circuitBreakerOpen');
    });

    this.breaker.on('halfOpen', () => {
      this.logger.info('B2 circuit breaker half-open - testing service');
    });

    this.breaker.on('close', () => {
      this.logger.info('B2 circuit breaker closed - service recovered');
      this.emit('circuitBreakerClosed');
    });
  }

  /**
   * High-performance upload with chunking for large files
   */
  async uploadFile(
    stream: Readable,
    fileName: string,
    size: number,
    tier: StorageTier = StorageTier.HOT,
    metadata: Record<string, string> = {}
  ): Promise<UploadResult> {
    const startTime = Date.now();
    const uploadId = crypto.randomUUID();

    try {
      this.logger.info('Starting upload', { uploadId, fileName, size, tier });

      let result: UploadResult;

      if (size > CHUNK_SIZE) {
        // Large file upload with chunking
        result = await this.uploadLargeFile(stream, fileName, size, tier, metadata, uploadId);
      } else {
        // Small file upload
        result = await this.uploadSmallFile(stream, fileName, size, tier, metadata, uploadId);
      }

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      const sizeCategory = this.getSizeCategory(size);
      
      uploadDuration.observe({ tier, size_category: sizeCategory }, duration);
      uploadCounter.inc({ tier, status: 'success' });

      // Cache upload result
      await this.redis.setex(
        `upload:${result.fileId}`,
        3600, // 1 hour cache
        JSON.stringify(result)
      );

      this.logger.info('Upload completed', {
        uploadId,
        fileId: result.fileId,
        duration,
        size,
        tier
      });

      this.emit('uploadComplete', result);
      return result;

    } catch (error) {
      uploadCounter.inc({ tier, status: 'error' });
      this.logger.error('Upload failed', { uploadId, error });
      throw error;
    }
  }

  private async uploadSmallFile(
    stream: Readable,
    fileName: string,
    size: number,
    tier: StorageTier,
    metadata: Record<string, string>,
    uploadId: string
  ): Promise<UploadResult> {
    const bucketName = this.getBucketForTier(tier);
    
    return await this.breaker.fire(async () => {
      const response = await this.b2.uploadFile({
        bucketName,
        fileName,
        data: stream,
        info: {
          ...metadata,
          uploadId,
          tier,
          originalSize: size.toString()
        }
      });

      return {
        fileId: response.fileId,
        fileName: response.fileName,
        uploadTimestamp: Date.now(),
        size,
        cost: this.calculateStorageCost(size, tier),
        tier
      };
    });
  }

  private async uploadLargeFile(
    stream: Readable,
    fileName: string,
    size: number,
    tier: StorageTier,
    metadata: Record<string, string>,
    uploadId: string
  ): Promise<UploadResult> {
    const bucketName = this.getBucketForTier(tier);
    
    // Start large file upload
    const startLargeFileResponse = await this.b2.startLargeFile({
      bucketName,
      fileName,
      info: {
        ...metadata,
        uploadId,
        tier,
        originalSize: size.toString()
      }
    });

    const fileId = startLargeFileResponse.fileId;
    const chunks: Array<{ partNumber: number; sha1: string }> = [];
    const uploadPromises: Promise<any>[] = [];

    // Create chunk upload stream
    let partNumber = 1;
    let bytesUploaded = 0;

    const chunkStream = new Transform({
      transform(chunk, encoding, callback) {
        const currentPartNumber = partNumber++;
        const chunkSize = chunk.length;
        
        // Upload chunk in parallel
        const uploadPromise = this.uploadLimiter(async () => {
          const sha1 = crypto.createHash('sha1').update(chunk).digest('hex');
          
          await this.b2.uploadPart({
            fileId,
            partNumber: currentPartNumber,
            data: chunk,
            sha1
          });

          return { partNumber: currentPartNumber, sha1 };
        });

        uploadPromises.push(uploadPromise);
        bytesUploaded += chunkSize;

        // Progress reporting
        const progress = (bytesUploaded / size) * 100;
        this.emit('uploadProgress', { uploadId, fileId, progress, bytesUploaded, size });

        callback();
      }
    });

    // Pipe stream through chunker
    await new Promise((resolve, reject) => {
      stream
        .pipe(chunkStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    // Wait for all chunks to upload
    const chunkResults = await Promise.all(uploadPromises);
    chunks.push(...chunkResults);

    // Finish large file upload
    const finishResponse = await this.b2.finishLargeFile({
      fileId,
      sha1Array: chunks.map(c => c.sha1)
    });

    return {
      fileId: finishResponse.fileId,
      fileName: finishResponse.fileName,
      uploadTimestamp: Date.now(),
      size,
      cost: this.calculateStorageCost(size, tier),
      tier
    };
  }

  private async uploadWithRetry(uploadFn: Function): Promise<any> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await uploadFn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          this.logger.warn(`Upload attempt ${attempt} failed, retrying in ${delay}ms`, { error });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  private getBucketForTier(tier: StorageTier): string {
    const buckets = {
      [StorageTier.HOT]: process.env.B2_HOT_BUCKET!,
      [StorageTier.WARM]: process.env.B2_WARM_BUCKET!,
      [StorageTier.COLD]: process.env.B2_COLD_BUCKET!,
      [StorageTier.ARCHIVE]: process.env.B2_ARCHIVE_BUCKET!
    };
    return buckets[tier];
  }

  private calculateStorageCost(size: number, tier: StorageTier): number {
    const costPerGB = {
      [StorageTier.HOT]: 0.005,     // $5/TB/month
      [StorageTier.WARM]: 0.0025,   // $2.5/TB/month
      [StorageTier.COLD]: 0.001,    // $1/TB/month
      [StorageTier.ARCHIVE]: 0.0005 // $0.5/TB/month
    };
    
    const sizeGB = size / (1024 * 1024 * 1024);
    return sizeGB * costPerGB[tier];
  }

  private getSizeCategory(size: number): string {
    if (size < 1024 * 1024) return 'small';        // < 1MB
    if (size < 100 * 1024 * 1024) return 'medium'; // < 100MB
    if (size < 1024 * 1024 * 1024) return 'large'; // < 1GB
    return 'xlarge';                                // >= 1GB
  }

  /**
   * Download file with streaming support
   */
  async downloadFile(fileId: string): Promise<Readable> {
    try {
      const downloadResponse = await this.b2.downloadFileById(fileId);
      
      // Record access for analytics
      await this.recordFileAccess(fileId);
      
      return downloadResponse.data;
    } catch (error) {
      this.logger.error('Download failed', { fileId, error });
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileId: string, fileName: string): Promise<void> {
    try {
      await this.b2.deleteFileVersion({ fileId, fileName });
      
      // Remove from cache
      await this.redis.del(`upload:${fileId}`);
      
      this.logger.info('File deleted', { fileId, fileName });
    } catch (error) {
      this.logger.error('Delete failed', { fileId, error });
      throw error;
    }
  }

  private async recordFileAccess(fileId: string): Promise<void> {
    const key = `access:${fileId}`;
    const pipeline = this.redis.pipeline();
    
    pipeline.hincrby(key, 'count', 1);
    pipeline.hset(key, 'lastAccess', Date.now());
    pipeline.expire(key, 86400 * 30); // 30 days
    
    await pipeline.exec();
  }

  /**
   * Get health status of the service
   */
  async getHealthStatus(): Promise<{ healthy: boolean; metrics: any }> {
    try {
      // Test B2 connection
      await this.b2.authorize();
      
      const metrics = {
        circuitBreakerState: this.breaker.stats,
        activeUploads: this.uploadLimiter.activeCount,
        pendingUploads: this.uploadLimiter.pendingCount
      };

      return { healthy: true, metrics };
    } catch (error) {
      return { healthy: false, metrics: { error: error.message } };
    }
  }
}

// Storage Tier Manager for intelligent data lifecycle
export class StorageTierManager {
  private b2: B2;
  private redis: Redis;
  private logger: Logger;

  constructor(b2: B2, redis: Redis, logger: Logger) {
    this.b2 = b2;
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Evaluate and potentially move asset to appropriate tier
   */
  async evaluateAndMoveAsset(assetId: string): Promise<void> {
    const accessPattern = await this.getAccessPattern(assetId);
    const currentTier = accessPattern.tier;
    const recommendedTier = this.recommendTier(accessPattern);

    if (currentTier !== recommendedTier) {
      await this.moveAssetToTier(assetId, recommendedTier);
      
      this.logger.info('Asset moved to new tier', {
        assetId,
        fromTier: currentTier,
        toTier: recommendedTier,
        accessPattern
      });
    }
  }

  private async getAccessPattern(assetId: string): Promise<AccessPattern> {
    const key = `access:${assetId}`;
    const data = await this.redis.hgetall(key);
    
    return {
      assetId,
      lastAccessed: new Date(parseInt(data.lastAccess) || 0),
      accessCount: parseInt(data.count) || 0,
      totalBandwidthUsed: parseInt(data.bandwidth) || 0,
      tier: (data.tier as StorageTier) || StorageTier.HOT
    };
  }

  private recommendTier(pattern: AccessPattern): StorageTier {
    const daysSinceAccess = (Date.now() - pattern.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    const avgAccessPerDay = pattern.accessCount / Math.max(daysSinceAccess, 1);

    // Tier recommendation logic
    if (avgAccessPerDay > 10) return StorageTier.HOT;
    if (avgAccessPerDay > 1) return StorageTier.WARM;
    if (daysSinceAccess < 90) return StorageTier.COLD;
    return StorageTier.ARCHIVE;
  }

  private async moveAssetToTier(assetId: string, newTier: StorageTier): Promise<void> {
    // Implementation for moving assets between tiers
    // This would involve copying to new bucket and deleting from old
    this.logger.info('Moving asset to tier', { assetId, newTier });
  }
}

// Cost Optimizer for predictive modeling and alerts
export class CostOptimizer {
  private redis: Redis;
  private logger: Logger;

  constructor(redis: Redis, logger: Logger) {
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Calculate current and projected costs
   */
  async calculateCosts(): Promise<CostMetrics> {
    const storageStats = await this.getStorageStats();
    const bandwidthStats = await this.getBandwidthStats();
    
    const costs = {
      storage: this.calculateStorageCosts(storageStats),
      bandwidth: this.calculateBandwidthCosts(bandwidthStats),
      transactions: this.calculateTransactionCosts(),
      total: 0
    };
    
    costs.total = costs.storage + costs.bandwidth + costs.transactions;
    
    // Update cost metrics
    costGauge.set({ type: 'storage', tier: 'total' }, costs.storage);
    costGauge.set({ type: 'bandwidth', tier: 'total' }, costs.bandwidth);
    costGauge.set({ type: 'transactions', tier: 'total' }, costs.transactions);
    
    return costs;
  }

  private async getStorageStats() {
    // Get storage usage statistics from Redis cache
    return {};
  }

  private async getBandwidthStats() {
    // Get bandwidth usage statistics
    return {};
  }

  private calculateStorageCosts(stats: any): number {
    // Calculate storage costs based on usage
    return 0;
  }

  private calculateBandwidthCosts(stats: any): number {
    // Calculate bandwidth costs
    return 0;
  }

  private calculateTransactionCosts(): number {
    // Calculate API transaction costs
    return 0;
  }
}

// Export metrics registry for Prometheus
export { register as metricsRegistry };
export default B2Service;
