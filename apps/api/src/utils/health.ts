import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  responseTime?: number;
  error?: string;
  details?: any;
}

export class HealthChecker {
  async check(dependencies: { database: PrismaClient; redis: Redis }): Promise<HealthStatus> {
    const startTime = Date.now();
    
    const checks = {
      database: await this.checkDatabase(dependencies.database),
      redis: await this.checkRedis(dependencies.redis),
      memory: this.checkMemory(),
      disk: this.checkDisk()
    };

    // Determine overall status
    const hasFailures = Object.values(checks).some(check => check.status === 'fail');
    const hasWarnings = Object.values(checks).some(check => check.status === 'warn');
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (hasFailures) {
      status = 'unhealthy';
    } else if (hasWarnings) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks
    };
  }

  private async checkDatabase(prisma: PrismaClient): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Simple query to check database connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: responseTime > 1000 ? 'warn' : 'pass',
        responseTime,
        details: {
          connectionPool: 'active'
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    }
  }

  private async checkRedis(redis: Redis): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      await redis.ping();
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: responseTime > 500 ? 'warn' : 'pass',
        responseTime,
        details: {
          mode: redis.mode,
          status: redis.status
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Redis error'
      };
    }
  }

  private checkMemory(): HealthCheck {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const memUsagePercent = (usedMem / totalMem) * 100;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (memUsagePercent > 90) {
      status = 'fail';
    } else if (memUsagePercent > 80) {
      status = 'warn';
    }
    
    return {
      status,
      details: {
        heapUsed: Math.round(usedMem / 1024 / 1024) + ' MB',
        heapTotal: Math.round(totalMem / 1024 / 1024) + ' MB',
        usage: Math.round(memUsagePercent) + '%',
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      }
    };
  }

  private checkDisk(): HealthCheck {
    // For basic disk check, we'll just verify we can access the current working directory
    try {
      const fs = require('fs');
      const stats = fs.statSync(process.cwd());
      
      return {
        status: 'pass',
        details: {
          workingDirectory: process.cwd(),
          accessible: true
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        error: error instanceof Error ? error.message : 'Disk access error'
      };
    }
  }
}
