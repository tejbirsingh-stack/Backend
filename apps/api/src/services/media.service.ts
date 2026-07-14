import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger.js';

interface MediaAsset {
  id: string;
  orgId: string;
  fileName: string;
  filePath: string;
  fileSize: bigint;
  mimeType: string;
  status: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateMediaAssetRequest {
  orgId: string;
  uploadedByUserId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  originalSize: number;
  metadata?: any;
}

export class MediaService {
  private prisma: PrismaClient;
  private logger: Logger;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new Logger('MediaService');
  }

  async createAsset(data: CreateMediaAssetRequest): Promise<MediaAsset> {
    try {
      this.logger.info('Creating media asset', { fileName: data.fileName, orgId: data.orgId });

      const asset = await this.prisma.mediaAsset.create({
        data: {
          orgId: data.orgId,
          uploadedByUserId: data.uploadedByUserId,
          fileName: data.fileName,
          filePath: data.filePath,
          mimeType: data.mimeType,
          fileSize: BigInt(data.fileSize),
          originalSize: BigInt(data.originalSize),
          metadata: data.metadata || {},
          status: 'uploading'
        }
      });

      this.logger.info('Media asset created successfully', { assetId: asset.id });
      return asset as MediaAsset;
    } catch (error) {
      this.logger.error('Failed to create media asset', { error: error instanceof Error ? error.message : 'Unknown error', data });
      throw error;
    }
  }

  async getAsset(id: string, orgId: string): Promise<MediaAsset | null> {
    try {
      const asset = await this.prisma.mediaAsset.findFirst({
        where: {
          id,
          orgId
        }
      });

      return asset as MediaAsset | null;
    } catch (error) {
      this.logger.error('Failed to get media asset', { error: error instanceof Error ? error.message : 'Unknown error', id });
      throw error;
    }
  }

  async listAssets(orgId: string, options: {
    limit?: number;
    offset?: number;
    status?: string;
    mimeType?: string;
    search?: string;
  } = {}): Promise<{ assets: MediaAsset[]; total: number }> {
    try {
      const {
        limit = 50,
        offset = 0,
        status,
        mimeType,
        search
      } = options;

      const where: any = {
        orgId
      };

      if (status) {
        where.status = status;
      }

      if (mimeType) {
        where.mimeType = mimeType;
      }

      if (search) {
        where.OR = [
          { fileName: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [assets, total] = await Promise.all([
        this.prisma.mediaAsset.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        }),
        this.prisma.mediaAsset.count({ where })
      ]);

      return {
        assets: assets as MediaAsset[],
        total
      };
    } catch (error) {
      this.logger.error('Failed to list media assets', { error: error instanceof Error ? error.message : 'Unknown error', orgId });
      throw error;
    }
  }

  async updateAssetStatus(id: string, status: string, metadata?: any): Promise<void> {
    try {
      await this.prisma.mediaAsset.update({
        where: { id },
        data: {
          status,
          ...(metadata && { metadata }),
          updatedAt: new Date()
        }
      });

      this.logger.info('Media asset status updated', { assetId: id, status });
    } catch (error) {
      this.logger.error('Failed to update media asset status', { error: error instanceof Error ? error.message : 'Unknown error', id, status });
      throw error;
    }
  }

  async deleteAsset(id: string, orgId: string): Promise<void> {
    try {
      await this.prisma.mediaAsset.deleteMany({
        where: {
          id,
          orgId
        }
      });

      this.logger.info('Media asset deleted', { assetId: id });
    } catch (error) {
      this.logger.error('Failed to delete media asset', { error: error instanceof Error ? error.message : 'Unknown error', id });
      throw error;
    }
  }

  async getStorageUsage(orgId: string): Promise<{ totalFiles: number; totalSize: bigint; sizeByClass: Record<string, bigint> }> {
    try {
      const results = await this.prisma.mediaAsset.groupBy({
        by: ['storageClass'],
        where: { orgId },
        _count: { id: true },
        _sum: { fileSize: true }
      });

      const totalFiles = results.reduce((acc, result) => acc + result._count.id, 0);
      const totalSize = results.reduce((acc, result) => acc + (result._sum.fileSize || BigInt(0)), BigInt(0));
      
      const sizeByClass: Record<string, bigint> = {};
      results.forEach(result => {
        sizeByClass[result.storageClass || 'unknown'] = result._sum.fileSize || BigInt(0);
      });

      return {
        totalFiles,
        totalSize,
        sizeByClass
      };
    } catch (error) {
      this.logger.error('Failed to get storage usage', { error: error instanceof Error ? error.message : 'Unknown error', orgId });
      throw error;
    }
  }
}

// Export singleton instance
export const mediaService = new MediaService((globalThis as any).prisma || new PrismaClient());
