import argon2 from 'argon2';
import { Logger } from '@noah/logger';

/**
 * Service for password hashing and verification
 */
export class PasswordService {
  private logger: Logger;
  private hashOptions: argon2.Options;
  
  constructor(logger: Logger) {
    this.logger = logger;
    
    // Configure hash options
    this.hashOptions = {
      type: argon2.argon2id, // Most secure variant
      memoryCost: 65536,     // 64 MiB
      timeCost: 3,           // Number of iterations
      parallelism: 4         // Parallel operations
    };
  }
  
  /**
   * Hash a password with Argon2id
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await argon2.hash(password, this.hashOptions);
    } catch (error) {
      this.logger.error('Password hashing failed', error);
      throw new Error('Failed to hash password');
    }
  }
  
  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      this.logger.error('Password verification failed', error);
      return false;
    }
  }
  
  /**
   * Check if a password meets security requirements
   */
  validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
    if (!password || password.length < 8) {
      return { valid: false, reason: 'Password must be at least 8 characters long' };
    }
    
    // Check for complexity requirements
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    
    if (!(hasUppercase && hasLowercase && hasNumbers)) {
      return { 
        valid: false, 
        reason: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' 
      };
    }
    
    if (!hasSpecialChars) {
      return { valid: false, reason: 'Password must contain at least one special character' };
    }
    
    // Check for common passwords
    const commonPasswords = [
      'password', 'password123', 'admin', 'admin123', 'qwerty', '123456', 'welcome'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      return { valid: false, reason: 'Password is too common' };
    }
    
    return { valid: true };
  }
}
