import jwt from 'jsonwebtoken';
import { Logger } from '@noah/logger';
import { TokenPayload, TokenPair } from '../interfaces';

/**
 * Service for generating and verifying JWT tokens
 */
export class TokenService {
  private logger: Logger;
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;
  
  constructor(logger: Logger) {
    this.logger = logger;
    
    // Load secrets from environment variables or use defaults for development
    this.accessTokenSecret = process.env.ACCESS_TOKEN_SECRET || 'access_token_secret_dev_only';
    this.refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET || 'refresh_token_secret_dev_only';
    this.accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY || '15m'; // 15 minutes
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d'; // 7 days
    
    if (process.env.NODE_ENV === 'production') {
      if (this.accessTokenSecret === 'access_token_secret_dev_only' || 
          this.refreshTokenSecret === 'refresh_token_secret_dev_only') {
        this.logger.warn('Using default token secrets in production! This is insecure.');
      }
    }
  }
  
  /**
   * Generate access and refresh tokens for a user
   */
  generateTokens(payload: TokenPayload): TokenPair {
    try {
      const accessToken = jwt.sign(payload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry
      });
      
      const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry
      });
      
      // Calculate expiry date
      const expirySeconds = this.parseExpiryString(this.accessTokenExpiry);
      const expiresAt = new Date(Date.now() + expirySeconds * 1000);
      
      return {
        accessToken,
        refreshToken,
        expiresAt
      };
      
    } catch (error) {
      this.logger.error('Failed to generate tokens', error);
      throw new Error('Token generation failed');
    }
  }
  
  /**
   * Verify an access token and return its payload
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret) as TokenPayload;
      return payload;
    } catch (error) {
      this.logger.debug('Token verification failed', { error: (error as Error).message });
      return null;
    }
  }
  
  /**
   * Verify a refresh token and return its payload
   */
  verifyRefreshToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.verify(token, this.refreshTokenSecret) as TokenPayload;
      return payload;
    } catch (error) {
      this.logger.debug('Refresh token verification failed', { error: (error as Error).message });
      return null;
    }
  }
  
  /**
   * Parse expiry string into seconds (e.g., "15m", "7d")
   */
  private parseExpiryString(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // Default 15 minutes in seconds
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 900;
    }
  }
}
