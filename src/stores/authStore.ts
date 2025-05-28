import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../services/api';

export interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      isLoading: false,
      error: null,

      login: (user, token) => {
        if (!user || !token) {
          set({ error: 'Invalid login data' });
          return;
        }
        // Store token in localStorage for API requests
        localStorage.setItem('auth-token', token);
        set({ 
          user, 
          isAuthenticated: true, 
          token,
          error: null
        });
      },

      logout: () => {
        // Remove token from localStorage
        localStorage.removeItem('auth-token');
        set({ 
          user: null, 
          isAuthenticated: false, 
          token: null,
          error: null
        });
      },

      checkAuth: async () => {
        const state = get();
        if (!state.token) {
          state.logout();
          return false;
        }

        try {
          set({ isLoading: true, error: null });
          const response = await api.getProfile();
          
          if (response.success && response.data) {
            set({ 
              user: response.data,
              isAuthenticated: true,
              isLoading: false
            });
            return true;
          } else {
            state.logout();
            return false;
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          state.logout();
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);