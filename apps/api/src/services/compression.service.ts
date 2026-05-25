import { Logger } from '../utils/logger.js';

interface CompressionJob {
  id: string;
  mediaAssetId: string;
  inputPath: string;
  outputPath?: string;
  preset: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface CompressionRequest {
  mediaAssetId: string;
  inputPath: string;
  preset: 'low' | 'medium' | 'high' | 'lossless';
  priority?: number;
}

export class CompressionService {
  private logger: Logger;
  private serviceUrl: string;
  private jobs: Map<string, CompressionJob> = new Map();

  constructor(serviceUrl: string = 'http://localhost:8080') {
    this.logger = new Logger('CompressionService');
    this.serviceUrl = serviceUrl;
  }

  async submitJob(request: CompressionRequest): Promise<string> {
    try {
      this.logger.info('Submitting compression job', { 
        mediaAssetId: request.mediaAssetId, 
        preset: request.preset 
      });

      const response = await fetch(`${this.serviceUrl}/api/compression/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          media_asset_id: request.mediaAssetId,
          input_path: request.inputPath,
          preset: request.preset,
          priority: request.priority || 1
        })
      });

      if (!response.ok) {
        throw new Error(`Compression service responded with status ${response.status}`);
      }

      const data = await response.json();
      const jobId = data.job_id;

      // Store job locally for tracking
      const job: CompressionJob = {
        id: jobId,
        mediaAssetId: request.mediaAssetId,
        inputPath: request.inputPath,
        preset: request.preset,
        status: 'pending',
        progress: 0,
        createdAt: new Date()
      };

      this.jobs.set(jobId, job);

      this.logger.info('Compression job submitted successfully', { jobId, mediaAssetId: request.mediaAssetId });
      return jobId;
    } catch (error) {
      this.logger.error('Failed to submit compression job', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        request 
      });
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<CompressionJob | null> {
    try {
      // First check local cache
      const cachedJob = this.jobs.get(jobId);
      if (cachedJob && cachedJob.status === 'completed') {
        return cachedJob;
      }

      // Fetch latest status from compression service
      const response = await fetch(`${this.serviceUrl}/api/compression/jobs/${jobId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Compression service responded with status ${response.status}`);
      }

      const data = await response.json();
      
      const job: CompressionJob = {
        id: data.job_id,
        mediaAssetId: data.media_asset_id,
        inputPath: data.input_path,
        outputPath: data.output_path,
        preset: data.preset,
        status: data.status,
        progress: data.progress || 0,
        originalSize: data.original_size,
        compressedSize: data.compressed_size,
        compressionRatio: data.compression_ratio,
        errorMessage: data.error_message,
        createdAt: new Date(data.created_at),
        startedAt: data.started_at ? new Date(data.started_at) : undefined,
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined
      };

      // Update local cache
      this.jobs.set(jobId, job);

      return job;
    } catch (error) {
      this.logger.error('Failed to get compression job status', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        jobId 
      });
      throw error;
    }
  }

  async listJobs(options: {
    status?: string;
    mediaAssetId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ jobs: CompressionJob[]; total: number }> {
    try {
      const queryParams = new URLSearchParams();
      
      if (options.status) queryParams.append('status', options.status);
      if (options.mediaAssetId) queryParams.append('media_asset_id', options.mediaAssetId);
      if (options.limit) queryParams.append('limit', options.limit.toString());
      if (options.offset) queryParams.append('offset', options.offset.toString());

      const response = await fetch(`${this.serviceUrl}/api/compression/jobs?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`Compression service responded with status ${response.status}`);
      }

      const data = await response.json();
      
      const jobs: CompressionJob[] = data.jobs.map((job: any) => ({
        id: job.job_id,
        mediaAssetId: job.media_asset_id,
        inputPath: job.input_path,
        outputPath: job.output_path,
        preset: job.preset,
        status: job.status,
        progress: job.progress || 0,
        originalSize: job.original_size,
        compressedSize: job.compressed_size,
        compressionRatio: job.compression_ratio,
        errorMessage: job.error_message,
        createdAt: new Date(job.created_at),
        startedAt: job.started_at ? new Date(job.started_at) : undefined,
        completedAt: job.completed_at ? new Date(job.completed_at) : undefined
      }));

      // Update local cache
      jobs.forEach(job => this.jobs.set(job.id, job));

      return {
        jobs,
        total: data.total || jobs.length
      };
    } catch (error) {
      this.logger.error('Failed to list compression jobs', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        options 
      });
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    try {
      this.logger.info('Cancelling compression job', { jobId });

      const response = await fetch(`${this.serviceUrl}/api/compression/jobs/${jobId}/cancel`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Compression service responded with status ${response.status}`);
      }

      // Update local cache
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.errorMessage = 'Job cancelled by user';
        this.jobs.set(jobId, job);
      }

      this.logger.info('Compression job cancelled successfully', { jobId });
    } catch (error) {
      this.logger.error('Failed to cancel compression job', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        jobId 
      });
      throw error;
    }
  }

  async getServiceHealth(): Promise<{ status: string; version: string; workers: number }> {
    try {
      const response = await fetch(`${this.serviceUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`Compression service health check failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Compression service health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async getCompressionStats(): Promise<{
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageCompressionRatio: number;
    totalSavings: number;
  }> {
    try {
      const response = await fetch(`${this.serviceUrl}/api/compression/stats`);
      
      if (!response.ok) {
        throw new Error(`Compression service responded with status ${response.status}`);
      }

      const data = await response.json();
      
      return {
        totalJobs: data.total_jobs,
        completedJobs: data.completed_jobs,
        failedJobs: data.failed_jobs,
        averageCompressionRatio: data.average_compression_ratio,
        totalSavings: data.total_savings
      };
    } catch (error) {
      this.logger.error('Failed to get compression stats', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }
}

// Export singleton instance
export const compressionService = new CompressionService(process.env.COMPRESSION_SERVICE_URL);
