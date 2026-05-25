/**
 * Simple Authentication Service
 *
 * This is a dead-simple auth implementation that just works.
 * No complex password hashing, no database, just simple validation.
 */

const VALID_USERS = [
  {
    email: 'admin@visitdetroit.com',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin',
    id: 'admin-001'
  },
  {
    email: 'test@example.com',
    password: 'test123',
    name: 'Test User',
    role: 'user',
    id: 'test-001'
  },
  {
    email: 'demo@demo.com',
    password: 'demo',
    name: 'Demo User',
    role: 'user',
    id: 'demo-001'
  }
];

class SimpleAuth {
  constructor() {
    // Store active sessions in memory
    this.sessions = new Map();
  }

  // Simple login - just check email and password
  login(email, password) {
    console.log(`[SimpleAuth] Login attempt for: ${email}`);

    // Find user
    const user = VALID_USERS.find(u =>
      u.email.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      console.log(`[SimpleAuth] User not found: ${email}`);
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Check password (case-sensitive)
    if (user.password !== password) {
      console.log(`[SimpleAuth] Invalid password for: ${email}`);
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Generate simple token
    const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store session
    this.sessions.set(token, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization: {
          id: 'org-001',
          name: 'Visit Detroit',
          slug: 'visit-detroit'
        }
      },
      createdAt: new Date()
    });

    console.log(`[SimpleAuth] Login successful for: ${email}`);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization: {
          id: 'org-001',
          name: 'Visit Detroit',
          slug: 'visit-detroit'
        }
      },
      accessToken: token,
      refreshToken: token + '_refresh'
    };
  }

  // Verify token
  verifyToken(token) {
    if (!token) return null;

    const session = this.sessions.get(token);
    if (!session) return null;

    // Check if session is still valid (24 hours)
    const hoursSinceCreation = (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      this.sessions.delete(token);
      return null;
    }

    return session.user;
  }

  // Logout
  logout(token) {
    if (token) {
      this.sessions.delete(token);
    }
    return { success: true };
  }

  // Get all valid users (for testing)
  getValidUsers() {
    return VALID_USERS.map(u => ({
      email: u.email,
      password: u.password,
      name: u.name
    }));
  }
}

module.exports = SimpleAuth;