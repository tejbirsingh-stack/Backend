import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

// Setup axios interceptors for authentication
export function setupAxiosInterceptors() {
  // Request interceptor to add auth header
  axios.interceptors.request.use(
    (config) => {
      const token = useAuthStore.getState().token;
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor to handle token expiration
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        
        try {
          // Try to refresh the token
          await useAuthStore.getState().refreshAccessToken();
          
          // Retry the original request with new token
          const token = useAuthStore.getState().token;
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return axios(originalRequest);
        } catch (refreshError) {
          // Refresh failed, logout user
          useAuthStore.getState().logout();
          window.location.href = '/auth';
          return Promise.reject(refreshError);
        }
      }
      
      return Promise.reject(error);
    }
  );
}

// Initialize on app start
setupAxiosInterceptors();