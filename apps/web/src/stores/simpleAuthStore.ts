import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Determine API URL based on environment
const getApiUrl = () => {
  // Check for Railway deployment
  if (window.location.hostname.includes('railway.app') ||
      window.location.hostname.includes('vercel.app')) {
    const backendUrl = 'https://noah-production-e15c.up.railway.app/api';
    console.log('🔗 Using production backend URL:', backendUrl);
    return backendUrl;
  }

  // In development, use proxy
  console.log('🔗 Using development proxy: /api');
  return '/api';
};

const API_URL = getApiUrl();

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

interface SimpleAuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useSimpleAuthStore = create<SimpleAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        console.log('🔐 Simple login attempt:', { email, apiUrl: `${API_URL}/auth/login` });
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include',
          });

          const data = await response.json();
          console.log('📥 Login response:', data);

          if (data.success && data.user && data.accessToken) {
            set({
              user: data.user,
              token: data.accessToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            return true;
          } else {
            const errorMessage = data.error || 'Login failed';
            console.error('❌ Login failed:', errorMessage);
            set({
              isLoading: false,
              error: errorMessage,
              isAuthenticated: false,
            });
            return false;
          }
        } catch (error: any) {
          console.error('❌ Login error:', error);
          const errorMessage = error.message || 'Connection failed. Please check your internet.';
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
          });
          return false;
        }
      },

      logout: () => {
        console.log('👋 Logging out...');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'noah-simple-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);