import { PrismaClient } from '@noah/db';
import { Logger } from '@noah/logger';
import { randomBytes, createHash } from 'crypto';
import { AuthContext, SessionInfo } from '../interfaces';

/**
 * Service for managing user sessions
 */
export class SessionService {
  private prisma: PrismaClient;
  private logger: Logger;
  
  constructor(prisma: PrismaClient, logger: Logger) {
    this.prisma = prisma;
    this.logger = logger;
  }
  
  /**
   * Create a new session for a user
   */
  async createSession(userId: string, context: AuthContext): Promise<SessionInfo> {
    try {
      // Generate a random token
      const token = randomBytes(48).toString('hex');
      
      // Create session in database
      const session = await this.prisma.userSession.create({
        data: {
          userId,
          token,
          ipAddress: context.ipAddress || 'Unknown',
          userAgent: context.userAgent || 'Unknown',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          lastActiveAt: new Date()
        }
      });
      
      return {
        id: session.id,
        userId: session.userId,
        ipAddress: session.ipAddress || undefined,
        userAgent: session.userAgent || undefined,
        expiresAt: session.expiresAt,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt
      };
    } catch (error) {
      this.logger.error('Failed to create session', error);
      throw new Error('Session creation failed');
    }
  }
  
  /**
   * Get a session by ID
   */
  async getSessionById(sessionId: string) {
    return await this.prisma.userSession.findUnique({
      where: { id: sessionId }
    });
  }
  
  /**
   * Get a session by token
   */
  async getSessionByToken(token: string) {
    return await this.prisma.userSession.findUnique({
      where: { token }
    });
  }
  
  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastActiveAt: 'desc' }
    });
    
    return sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      ipAddress: session.ipAddress || undefined,
      userAgent: session.userAgent || undefined,
      expiresAt: session.expiresAt,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt
    }));
  }
  
  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() }
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
      return false;
    }
  }
  
  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    try {
      const result = await this.prisma.userSession.updateMany({
        where: {
          userId,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
      
      return result.count;
    } catch (error) {
      this.logger.error('Failed to revoke all user sessions', error);
      return 0;
    }
  }
  
  /**
   * Update the last activity timestamp for a session
   */
  async updateLastActivity(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.userSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() }
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to update session activity', error);
      return false;
    }
  }
  
  /**
   * Update the refresh token for a session
   */
  async updateSessionRefreshToken(sessionId: string, refreshToken: string): Promise<boolean> {
    try {
      await this.prisma.userSession.update({
        where: { id: sessionId },
        data: { 
          refreshToken,
          lastActiveAt: new Date()
        }
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to update session refresh token', error);
      return false;
    }
  }
  
  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.prisma.userSession.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
      
      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', error);
      return 0;
    }
  }
}
