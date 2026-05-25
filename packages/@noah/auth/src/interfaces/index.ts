/**
 * Authentication and authorization interfaces
 */

export interface UserCredentials {
  email: string;
  password: string;
  mfaCode?: string;
  deviceFingerprint?: string;
}

export interface RegistrationData {
  email: string;
  name: string;
  password: string;
  orgId: string;
  role?: string;
}

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, any>;
}

export interface TokenPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  sessionId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  requiresMfa?: boolean;
  error?: string;
  riskAssessment?: {
    score: number;
    factors?: string[];
  };
}

export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  lastActiveAt: Date;
  createdAt: Date;
}

export interface MfaSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes?: string[];
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmation {
  token: string;
  newPassword: string;
}

export interface PasswordChangeRequest {
  userId: string;
  currentPassword: string;
  newPassword: string;
}
