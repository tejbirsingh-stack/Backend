import { authService } from '../services/auth.service';
import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware for authenticating requests
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Validate the token and session
    const result = await authService.validateSession(token);
    
    if (!result.valid || !result.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired session'
      });
    }
    
    // Attach user and session info to the request
    (req as any).user = result.user;
    (req as any).sessionId = result.sessionId;
    
    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Express middleware for authorizing requests based on roles
 */
export function authorize(allowedRoles: string | string[] = []) {
  // Convert string to array if only one role is provided
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // First ensure the user is authenticated
      if (!(req as any).user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      // If no roles specified or empty array, allow all roles
      if (!roles.length) {
        return next();
      }
      
      // Check if user role is in allowed roles
      const userRole = (req as any).user.role;
      
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions'
        });
      }
      
      // User has the required role
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authorization failed'
      });
    }
  };
}

/**
 * Express middleware for verifying organization access
 */
export function verifyOrgAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // First ensure the user is authenticated
      if (!(req as any).user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      // Check if the organization ID in the request matches the user's organization
      const requestOrgId = req.params.orgId || req.query.orgId || req.body.orgId;
      
      if (requestOrgId && requestOrgId !== (req as any).user.orgId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this organization'
        });
      }
      
      // User has access to the organization
      next();
    } catch (error) {
      console.error('Organization access verification error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Organization access verification failed'
      });
    }
  };
}
