import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { authenticate, authorize } from './middleware/auth.middleware';
import { createAuthRouter } from './routes/auth.routes';

// Interfaces
export * from './interfaces';

// Services
export {
  AuthService,
  TokenService,
  MfaService,
  PasswordService,
  SessionService
};

// Middleware
export {
  authenticate,
  authorize
};

// Routes
export {
  createAuthRouter
};

// Main service instance
export { authService } from './services/auth.service';
