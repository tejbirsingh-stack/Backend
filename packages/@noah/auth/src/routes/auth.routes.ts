import { Router } from 'express';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { passwordService } from '../services/password.service';
import { PrismaClient } from '@noah/db';
import { Logger } from '@noah/logger';
import crypto from 'crypto';
import { addDays } from 'date-fns';

const prisma = new PrismaClient();
const logger = new Logger('auth-routes');

/**
 * Create an Express router for authentication routes
 */
export function createAuthRouter() {
  const router = Router();
  
  /**
   * @route POST /auth/login
   * @desc Authenticate user and get token
   * @access Public
   */
  router.post('/login', async (req, res) => {
    try {
      const { email, password, mfaCode } = req.body;
      
      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required'
        });
      }
      
      // Authenticate the user
      const result = await authService.authenticate(
        { email, password, mfaCode },
        { 
          ipAddress: req.ip, 
          userAgent: req.headers['user-agent'] 
        }
      );
      
      if (!result.success) {
        if (result.requiresMfa) {
          return res.status(403).json({
            error: 'MFA Required',
            message: result.error || 'MFA code required',
            requiresMfa: true
          });
        }
        
        return res.status(401).json({
          error: 'Authentication Failed',
          message: result.error || 'Invalid credentials'
        });
      }
      
      // Return user info and tokens
      return res.json({
        user: result.user,
        token: result.tokens?.accessToken,
        refreshToken: result.tokens?.refreshToken,
        expiresAt: result.tokens?.expiresAt
      });
      
    } catch (error) {
      logger.error('Login error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Login failed'
      });
    }
  });
  
  /**
   * @route POST /auth/register
   * @desc Register a new user
   * @access Public
   */
  router.post('/register', async (req, res) => {
    try {
      const { name, email, password, orgId } = req.body;
      
      // Validate input
      if (!name || !email || !password || !orgId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Name, email, password, and organization ID are required'
        });
      }
      
      // Validate password strength
      const passwordValidation = passwordService.validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: 'Weak Password',
          message: passwordValidation.reason
        });
      }
      
      // Register the user
      const result = await authService.register({
        name,
        email,
        password,
        orgId
      });
      
      if (!result.success) {
        return res.status(400).json({
          error: 'Registration Failed',
          message: result.error
        });
      }
      
      // Return success message and user info
      return res.status(201).json({
        message: 'User registered successfully',
        user: result.user
      });
      
    } catch (error) {
      logger.error('Registration error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Registration failed'
      });
    }
  });
  
  /**
   * @route POST /auth/logout
   * @desc Logout user and invalidate token
   * @access Protected
   */
  router.post('/logout', authenticate, async (req, res) => {
    try {
      const sessionId = (req as any).sessionId;
      
      if (!sessionId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No active session'
        });
      }
      
      await authService.logout(sessionId);
      
      return res.json({
        message: 'Logged out successfully'
      });
      
    } catch (error) {
      logger.error('Logout error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Logout failed'
      });
    }
  });
  
  /**
   * @route POST /auth/token/refresh
   * @desc Refresh access token
   * @access Public
   */
  router.post('/token/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required'
        });
      }
      
      const result = await authService.refreshToken(refreshToken);
      
      if (!result.success) {
        return res.status(401).json({
          error: 'Invalid Token',
          message: result.error || 'Token refresh failed'
        });
      }
      
      return res.json({
        token: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresAt: result.tokens.expiresAt
      });
      
    } catch (error) {
      logger.error('Token refresh error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Token refresh failed'
      });
    }
  });
  
  /**
   * @route POST /auth/password/forgot
   * @desc Request password reset
   * @access Public
   */
  router.post('/password/forgot', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Email is required'
        });
      }
      
      // Find the user
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      // Don't reveal if the user exists for security reasons
      if (!user) {
        return res.json({
          message: 'If your email is registered, you will receive password reset instructions'
        });
      }
      
      // Generate a random token
      const token = crypto.randomBytes(32).toString('hex');
      
      // Store the token in the database
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: addDays(new Date(), 1) // Valid for 24 hours
        }
      });
      
      // TODO: Send email with reset link
      // For now, just return the token for testing
      logger.info('Password reset requested', { userId: user.id, email });
      
      return res.json({
        message: 'If your email is registered, you will receive password reset instructions',
        // Remove this in production
        resetToken: token
      });
      
    } catch (error) {
      logger.error('Password reset request error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Password reset request failed'
      });
    }
  });
  
  /**
   * @route POST /auth/password/reset
   * @desc Reset password with token
   * @access Public
   */
  router.post('/password/reset', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Token and new password are required'
        });
      }
      
      // Validate password strength
      const passwordValidation = passwordService.validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: 'Weak Password',
          message: passwordValidation.reason
        });
      }
      
      // Find the token
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token },
        include: { user: true }
      });
      
      if (!resetToken || resetToken.expiresAt < new Date() || resetToken.usedAt) {
        return res.status(400).json({
          error: 'Invalid Token',
          message: 'Invalid or expired password reset token'
        });
      }
      
      // Hash the new password
      const passwordHash = await passwordService.hashPassword(newPassword);
      
      // Update the user's password
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockoutUntil: null
        }
      });
      
      // Mark the token as used
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      });
      
      logger.info('Password reset successful', { userId: resetToken.userId });
      
      return res.json({
        message: 'Password has been reset successfully'
      });
      
    } catch (error) {
      logger.error('Password reset error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Password reset failed'
      });
    }
  });
  
  /**
   * @route POST /auth/password/change
   * @desc Change password (when logged in)
   * @access Protected
   */
  router.post('/password/change', authenticate, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = (req as any).user.id;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Current password and new password are required'
        });
      }
      
      // Validate password strength
      const passwordValidation = passwordService.validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: 'Weak Password',
          message: passwordValidation.reason
        });
      }
      
      // Get the user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
      });
      
      if (!user || !user.passwordHash) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'User does not have a password set'
        });
      }
      
      // Verify current password
      const isPasswordValid = await passwordService.verifyPassword(currentPassword, user.passwordHash);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Current password is incorrect'
        });
      }
      
      // Hash the new password
      const passwordHash = await passwordService.hashPassword(newPassword);
      
      // Update the user's password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash }
      });
      
      logger.info('Password changed', { userId });
      
      return res.json({
        message: 'Password changed successfully'
      });
      
    } catch (error) {
      logger.error('Password change error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Password change failed'
      });
    }
  });
  
  /**
   * @route POST /auth/mfa/setup
   * @desc Setup MFA for a user
   * @access Protected
   */
  router.post('/mfa/setup', authenticate, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Check if MFA is already enabled
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mfaEnabled: true }
      });
      
      if (user?.mfaEnabled) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'MFA is already enabled for this account'
        });
      }
      
      // Setup MFA
      const mfaSetup = await authService.mfaService.setupMfa(userId);
      
      return res.json({
        secret: mfaSetup.secret,
        qrCodeUrl: mfaSetup.qrCodeUrl,
        backupCodes: mfaSetup.backupCodes
      });
      
    } catch (error) {
      logger.error('MFA setup error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'MFA setup failed'
      });
    }
  });
  
  /**
   * @route POST /auth/mfa/enable
   * @desc Enable MFA after setup
   * @access Protected
   */
  router.post('/mfa/enable', authenticate, async (req, res) => {
    try {
      const { token } = req.body;
      const userId = (req as any).user.id;
      
      if (!token) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Verification token is required'
        });
      }
      
      // Enable MFA
      const success = await authService.mfaService.enableMfa(userId, token);
      
      if (!success) {
        return res.status(400).json({
          error: 'Invalid Token',
          message: 'Invalid verification code'
        });
      }
      
      logger.info('MFA enabled', { userId });
      
      return res.json({
        message: 'MFA enabled successfully'
      });
      
    } catch (error) {
      logger.error('MFA enable error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to enable MFA'
      });
    }
  });
  
  /**
   * @route POST /auth/mfa/disable
   * @desc Disable MFA
   * @access Protected
   */
  router.post('/mfa/disable', authenticate, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Disable MFA
      const success = await authService.mfaService.disableMfa(userId);
      
      if (!success) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Failed to disable MFA'
        });
      }
      
      logger.info('MFA disabled', { userId });
      
      return res.json({
        message: 'MFA disabled successfully'
      });
      
    } catch (error) {
      logger.error('MFA disable error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to disable MFA'
      });
    }
  });
  
  /**
   * @route GET /auth/sessions
   * @desc Get all active sessions for the current user
   * @access Protected
   */
  router.get('/sessions', authenticate, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Get all sessions
      const sessions = await authService.sessionService.getUserSessions(userId);
      
      return res.json({ sessions });
      
    } catch (error) {
      logger.error('Get sessions error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get sessions'
      });
    }
  });
  
  /**
   * @route DELETE /auth/sessions/:sessionId
   * @desc Revoke a specific session
   * @access Protected
   */
  router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user.id;
      const currentSessionId = (req as any).sessionId;
      
      // Check if the session belongs to the user
      const session = await prisma.userSession.findUnique({
        where: { id: sessionId },
        select: { userId: true }
      });
      
      if (!session || session.userId !== userId) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Session not found'
        });
      }
      
      // Revoke the session
      await authService.sessionService.revokeSession(sessionId);
      
      // If the user is revoking their current session, they need to re-login
      if (sessionId === currentSessionId) {
        return res.json({
          message: 'Current session revoked, please login again',
          currentSessionRevoked: true
        });
      }
      
      return res.json({
        message: 'Session revoked successfully'
      });
      
    } catch (error) {
      logger.error('Revoke session error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to revoke session'
      });
    }
  });
  
  /**
   * @route DELETE /auth/sessions
   * @desc Revoke all sessions except the current one
   * @access Protected
   */
  router.delete('/sessions', authenticate, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const currentSessionId = (req as any).sessionId;
      
      // Get all other sessions
      const sessions = await prisma.userSession.findMany({
        where: {
          userId,
          id: { not: currentSessionId },
          revokedAt: null
        }
      });
      
      // Revoke each session individually
      for (const session of sessions) {
        await authService.sessionService.revokeSession(session.id);
      }
      
      return res.json({
        message: `Revoked ${sessions.length} session(s)`
      });
      
    } catch (error) {
      logger.error('Revoke all sessions error', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to revoke sessions'
      });
    }
  });
  
  return router;
}
