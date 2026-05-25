import { PrismaClient } from '@noah/db';
import { Logger } from '@noah/logger';
import { authenticator } from 'otplib';
import { nanoid } from 'nanoid';
import { MfaSetupResult } from '../interfaces';

/**
 * Service for Multi-Factor Authentication
 */
export class MfaService {
  private prisma: PrismaClient;
  private logger: Logger;
  private issuer: string;
  
  constructor(prisma: PrismaClient, logger: Logger) {
    this.prisma = prisma;
    this.logger = logger;
    this.issuer = process.env.MFA_ISSUER || 'Noah Media Platform';
    
    // Configure authenticator
    authenticator.options = {
      window: 1, // Allow 1 time step (30 seconds) before/after current time
      step: 30   // Default time step in seconds
    };
  }
  
  /**
   * Generate a new TOTP secret for a user
   */
  async setupMfa(userId: string): Promise<MfaSetupResult> {
    try {
      // Get the user
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Generate new secret
      const secret = authenticator.generateSecret();
      
      // Generate QR code URL
      const qrCodeUrl = authenticator.keyuri(user.email, this.issuer, secret);
      
      // Generate backup codes (10 codes, 8 characters each)
      const backupCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        backupCodes.push(nanoid(8).toUpperCase());
      }
      
      // Store secret in the database (but don't enable MFA yet)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaSecret: secret,
          // Store backup codes if we add them to the schema in the future
        }
      });
      
      return {
        secret,
        qrCodeUrl,
        backupCodes
      };
      
    } catch (error) {
      this.logger.error('MFA setup failed', error);
      throw new Error('Failed to setup MFA');
    }
  }
  
  /**
   * Verify a TOTP token for a user
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    try {
      // Get the user with MFA secret
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { mfaSecret: true }
      });
      
      if (!user || !user.mfaSecret) {
        return false;
      }
      
      // Verify the token
      return authenticator.verify({ token, secret: user.mfaSecret });
      
    } catch (error) {
      this.logger.error('MFA verification failed', error);
      return false;
    }
  }
  
  /**
   * Enable MFA for a user after successful verification
   */
  async enableMfa(userId: string, token: string): Promise<boolean> {
    try {
      // First verify the token
      const isValid = await this.verifyToken(userId, token);
      
      if (!isValid) {
        return false;
      }
      
      // Enable MFA
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true }
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('MFA enablement failed', error);
      return false;
    }
  }
  
  /**
   * Disable MFA for a user
   */
  async disableMfa(userId: string): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null
        }
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('MFA disablement failed', error);
      return false;
    }
  }
}
