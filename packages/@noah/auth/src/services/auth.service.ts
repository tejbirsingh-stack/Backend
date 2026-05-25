import { PrismaClient } from '@noah/db';
import { Logger } from '@noah/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { MfaService } from './mfa.service';
import { SessionService } from './session.service';
import {
  UserCredentials,
  AuthContext,
  AuthResult,
  RegistrationData,
  User
} from '../interfaces';

/**
 * Main authentication service that orchestrates the entire auth flow
 */
export class AuthService {
  private prisma: PrismaClient;
  private logger: Logger;
  private tokenService: TokenService;
  private passwordService: PasswordService;
  private mfaService: MfaService;
  private sessionService: SessionService;
  
  // Rate limiter for login attempts
  private loginRateLimiter: RateLimiterMemory;
  
  constructor(
    prisma: PrismaClient,
    logger: Logger,
    tokenService: TokenService,
    passwordService: PasswordService,
    mfaService: MfaService,
    sessionService: SessionService
  ) {
    this.prisma = prisma;
    this.logger = logger;
    this.tokenService = tokenService;
    this.passwordService = passwordService;
    this.mfaService = mfaService;
    this.sessionService = sessionService;
    
    // Initialize rate limiter
    this.loginRateLimiter = new RateLimiterMemory({
      points: 5, // 5 attempts
      duration: 60 * 15, // per 15 minutes
    });
  }
  
  /**
   * Authenticate a user with email, password and optional MFA
   */
  async authenticate(credentials: UserCredentials, context: AuthContext): Promise<AuthResult> {
    const { email, password, mfaCode } = credentials;
    const key = `${email}:${context.ipAddress || 'unknown'}`;
    
    try {
      // Check rate limiting
      try {
        await this.loginRateLimiter.consume(key);
      } catch (error) {
        this.logger.warn('Rate limit exceeded for login', { email, ip: context.ipAddress });
        return {
          success: false,
          error: 'Too many login attempts. Please try again later.'
        };
      }
      
      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email }
      });
      
      if (!user || !user.passwordHash) {
        this.logger.warn('Login attempt with invalid email', { email, ip: context.ipAddress });
        return { success: false, error: 'Invalid email or password' };
      }
      
      // Check if account is locked
      if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        this.logger.warn('Login attempt on locked account', { userId: user.id, ip: context.ipAddress });
        return { 
          success: false, 
          error: 'Account is temporarily locked due to too many failed login attempts' 
        };
      }
      
      // Check if account is active
      if (user.status !== 'active') {
        this.logger.warn('Login attempt on inactive account', { userId: user.id, ip: context.ipAddress });
        return { success: false, error: 'Account is not active' };
      }
      
      // Verify password
      const isPasswordValid = await this.passwordService.verifyPassword(password, user.passwordHash);
      
      if (!isPasswordValid) {
        // Increment failed login attempts
        await this.prisma.user.update({
          where: { id: user.id },
          data: { 
            failedLoginAttempts: { increment: 1 },
            // Lock account after 5 failed attempts for 15 minutes
            lockoutUntil: user.failedLoginAttempts >= 4 ? new Date(Date.now() + 15 * 60 * 1000) : null
          }
        });
        
        this.logger.warn('Login attempt with invalid password', { userId: user.id, ip: context.ipAddress });
        return { success: false, error: 'Invalid email or password' };
      }
      
      // If MFA is enabled, verify the code
      if (user.mfaEnabled) {
        if (!mfaCode) {
          return {
            success: false,
            requiresMfa: true,
            error: 'MFA verification required'
          };
        }
        
        const isMfaValid = await this.mfaService.verifyToken(user.id, mfaCode);
        if (!isMfaValid) {
          this.logger.warn('Login attempt with invalid MFA code', { userId: user.id, ip: context.ipAddress });
          return {
            success: false,
            requiresMfa: true,
            error: 'Invalid MFA code'
          };
        }
      }
      
      // Create a new session
      const session = await this.sessionService.createSession(user.id, context);
      
      // Generate tokens
      const tokens = this.tokenService.generateTokens({
        userId: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
        sessionId: session.id
      });
      
      // Reset failed login attempts and update last login timestamp
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null,
          lastLoginAt: new Date()
        }
      });
      
      this.logger.info('User authenticated successfully', { userId: user.id, ip: context.ipAddress });
      
      // Return success result with user and tokens
      return {
        success: true,
        user: {
          id: user.id,
          orgId: user.orgId,
          email: user.email,
          name: user.name || '',
          role: user.role,
          status: user.status,
          mfaEnabled: user.mfaEnabled,
          lastLoginAt: user.lastLoginAt || undefined,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        tokens
      };
      
    } catch (error) {
      this.logger.error('Authentication error', error);
      return { success: false, error: 'An error occurred during authentication' };
    }
  }
  
  /**
   * Register a new user
   */
  async register(data: RegistrationData): Promise<AuthResult> {
    try {
      const { email, name, password, orgId, role = 'user' } = data;
      
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        return { success: false, error: 'Email already in use' };
      }
      
      // Check if organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: orgId }
      });
      
      if (!organization) {
        return { success: false, error: 'Invalid organization' };
      }
      
      // Hash the password
      const passwordHash = await this.passwordService.hashPassword(password);
      
      // Create the user
      const user = await this.prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          orgId,
          role,
          status: 'active'
        }
      });
      
      this.logger.info('New user registered', { userId: user.id, email });
      
      // Return success without automatic login
      return {
        success: true,
        user: {
          id: user.id,
          orgId: user.orgId,
          email: user.email,
          name: user.name || '',
          role: user.role,
          status: user.status,
          mfaEnabled: user.mfaEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };
      
    } catch (error) {
      this.logger.error('Registration error', error);
      return { success: false, error: 'An error occurred during registration' };
    }
  }
  
  /**
   * Logout a user by revoking their session
   */
  async logout(sessionId: string): Promise<boolean> {
    try {
      await this.sessionService.revokeSession(sessionId);
      return true;
    } catch (error) {
      this.logger.error('Logout error', error);
      return false;
    }
  }
  
  /**
   * Verify a user's session using a token
   */
  async validateSession(token: string): Promise<{ valid: boolean; user?: User; sessionId?: string }> {
    try {
      // Verify JWT and extract payload
      const payload = this.tokenService.verifyToken(token);
      if (!payload) {
        return { valid: false };
      }
      
      // Check if session exists and is valid
      const session = await this.sessionService.getSessionById(payload.sessionId!);
      if (!session || session.revokedAt) {
        return { valid: false };
      }
      
      // Get the user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId }
      });
      
      if (!user || user.status !== 'active') {
        return { valid: false };
      }
      
      // Update session last activity time
      await this.sessionService.updateLastActivity(session.id);
      
      return {
        valid: true,
        user: {
          id: user.id,
          orgId: user.orgId,
          email: user.email,
          name: user.name || '',
          role: user.role,
          status: user.status,
          mfaEnabled: user.mfaEnabled,
          lastLoginAt: user.lastLoginAt || undefined,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        sessionId: session.id
      };
      
    } catch (error) {
      this.logger.error('Session validation error', error);
      return { valid: false };
    }
  }
  
  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ success: boolean; tokens?: any; error?: string }> {
    try {
      const payload = this.tokenService.verifyRefreshToken(refreshToken);
      
      if (!payload || !payload.sessionId) {
        return { success: false, error: 'Invalid refresh token' };
      }
      
      // Get session and verify it's active
      const session = await this.sessionService.getSessionById(payload.sessionId);
      if (!session || session.revokedAt || !session.refreshToken) {
        return { success: false, error: 'Session expired or invalid' };
      }
      
      // Verify the refresh token matches what's stored
      if (session.refreshToken !== refreshToken) {
        // Token reuse detected, revoke all sessions for security
        await this.sessionService.revokeAllUserSessions(session.userId);
        this.logger.warn('Refresh token reuse detected', { userId: session.userId });
        return { success: false, error: 'Token reuse detected, all sessions have been revoked' };
      }
      
      // Generate new tokens
      const user = await this.prisma.user.findUnique({
        where: { id: session.userId }
      });
      
      if (!user || user.status !== 'active') {
        return { success: false, error: 'User account is not active' };
      }
      
      const tokens = this.tokenService.generateTokens({
        userId: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
        sessionId: session.id
      });
      
      // Update session with new refresh token
      await this.sessionService.updateSessionRefreshToken(session.id, tokens.refreshToken);
      
      return { success: true, tokens };
      
    } catch (error) {
      this.logger.error('Token refresh error', error);
      return { success: false, error: 'Failed to refresh token' };
    }
  }
}

// Create singleton instance
const prisma = new PrismaClient();
const logger = new Logger({ name: 'auth-service' });
const tokenService = new TokenService(logger);
const passwordService = new PasswordService(logger);
const mfaService = new MfaService(prisma, logger);
const sessionService = new SessionService(prisma, logger);

export const authService = new AuthService(
  prisma, 
  logger, 
  tokenService, 
  passwordService, 
  mfaService, 
  sessionService
);
