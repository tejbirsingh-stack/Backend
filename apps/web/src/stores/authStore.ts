import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

// Determine API URL based on environment
const getApiUrl = () => {
  // Check for environment variable first
  if (import.meta.env.VITE_API_URL) {
    console.log('🔗 Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }

  // In production, use the backend Railway URL directly
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

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organization: Organization;
  avatar?: string;
}

interface AuthResponse {
  success: boolean;
  user: User;
  accessToken: string;
  refreshToken: string;
  error?: string;
  requiresMfa?: boolean;
}

interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
  orgId: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requiresMfa: boolean;
  mfaEmail: string | null;
  mfaPassword: string | null;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  register: (credentials: RegisterCredentials) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  submitMfaCode: (code: string) => Promise<AuthResponse>;
  resetPassword: (email: string) => Promise<boolean>;
  refreshAccessToken: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      organization: null,
      isAuthenticated: false,
      isLoading: false,
      requiresMfa: false,
      mfaEmail: null,
      mfaPassword: null,
      error: null,

      login: async ({ email, password, mfaCode }: LoginCredentials) => {
        console.log('🔐 Login attempt:', { email, apiUrl: `${API_URL}/auth/login` });
        set({ isLoading: true }); // Don't clear error immediately

        try {
          const response = await axios.post<AuthResponse>(`${API_URL}/auth/login`, {
            email,
            password,
            mfaCode
          });

          console.log('📥 Login response:', {
            status: response.status,
            success: response.data?.success,
            hasUser: !!response.data?.user,
            hasToken: !!response.data?.accessToken
          });

          if (!response.data.success) {
            console.error('❌ Login failed - success=false:', response.data.error);
            throw new Error(response.data.error || 'Login failed');
          }
          
          const { user, accessToken, refreshToken } = response.data;
          
          // Set auth header for future requests
          axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          
          set({
            user,
            token: accessToken,
            refreshToken,
            organization: user.organization,
            isAuthenticated: true,
            isLoading: false,
            requiresMfa: false,
            mfaEmail: null,
            mfaPassword: null,
            error: null // Clear error on successful login
          });
          
          return response.data;
        } catch (error: any) {
          console.error('❌ Login error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            url: error.config?.url
          });

          // Handle MFA requirement
          if (error.response?.status === 400 && error.response?.data?.requiresMfa) {
            set({
              isLoading: false,
              requiresMfa: true,
              mfaEmail: email,
              mfaPassword: password,
              error: null
            });
            return error.response.data;
          }
          
          // Better error message handling
          let errorMessage = 'Login failed';
          
          if (error.code === 'NETWORK_ERROR' || !error.response) {
            errorMessage = 'Cannot connect to server. Please check your connection.';
          } else if (error.response?.status === 401) {
            errorMessage = error.response?.data?.error || 'Invalid email or password';
          } else if (error.response?.status === 400) {
            errorMessage = error.response?.data?.error || 'Please check your login details';
          } else if (error.response?.status >= 500) {
            errorMessage = 'Server error. Please try again later.';
          } else {
            errorMessage = error.response?.data?.error || error.response?.data?.message || 'Login failed';
          }
          
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false
          });

          // Return error response instead of throwing
          return {
            success: false,
            error: errorMessage
          };
        }
      },

      submitMfaCode: async (code: string) => {
        const { mfaEmail, mfaPassword } = get();
        
        if (!mfaEmail || !mfaPassword) {
          throw new Error('MFA session data is missing');
        }
        
        return get().login({
          email: mfaEmail,
          password: mfaPassword,
          mfaCode: code
        });
      },

      register: async ({ name, email, password, orgId }: RegisterCredentials) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await axios.post<AuthResponse>(`${API_URL}/auth/register`, {
            name,
            email,
            password,
            orgId
          });
          
          const { user, accessToken, refreshToken } = response.data;
          
          // Set auth header for future requests
          axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          
          set({
            user,
            token: accessToken,
            refreshToken,
            organization: user.organization,
            isAuthenticated: true,
            isLoading: false
          });
          
          return response.data;
        } catch (error: any) {
          const errorMessage = error.response?.data?.message || 'Registration failed';
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false
          });

          // Return error response that matches AuthResponse interface
          return {
            success: false,
            error: errorMessage,
            user: null as any,
            accessToken: '',
            refreshToken: ''
          } as AuthResponse;
        }
      },

      logout: async () => {
        const { token } = get();
        set({ isLoading: true, error: null });
        
        try {
          if (token) {
            await axios.post(
              `${API_URL}/auth/logout`, 
              {}, 
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear auth header
          delete axios.defaults.headers.common['Authorization'];
          
          set({
            user: null,
            token: null,
            refreshToken: null,
            organization: null,
            isAuthenticated: false,
            isLoading: false
          });
        }
      },

      resetPassword: async (email: string) => {
        set({ isLoading: true, error: null });
        
        try {
          await axios.post(`${API_URL}/auth/reset-password`, { email });
          set({ isLoading: false });
          return true;
        } catch (error: any) {
          const errorMessage = error.response?.data?.message || 'Failed to send password reset email';
          set({ 
            isLoading: false, 
            error: errorMessage 
          });
          return false;
        }
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        
        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken
          });
          
          if (response.data.success) {
            const { accessToken } = response.data;
            
            // Update auth header
            axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
            
            set({ token: accessToken });
          } else {
            throw new Error('Failed to refresh token');
          }
        } catch (error) {
          console.error('Token refresh error:', error);
          // Force logout on refresh failure
          get().logout();
          throw error;
        }
      },
      
      setUser: (user: User) => {
        set({ user, organization: user.organization });
      },
      
      clearError: () => {
        set({ error: null });
      }
    }),
    {
      name: 'noah-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        organization: state.organization,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
