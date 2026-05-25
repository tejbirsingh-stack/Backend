export const authService = {
  validateSession: async (token) => {
    // For development purposes, return a dummy session
    return {
      id: "session_123",
      user: {
        id: "user_123",
        email: "dev@example.com",
        name: "Development User",
        role: "admin",
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    };
  },
};
