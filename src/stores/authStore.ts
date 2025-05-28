import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  checkAuth: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      login: (user, token) => {
        if (!user || !token) {
          console.error('Invalid login data');
          return;
        }
        set({ 
          user, 
          isAuthenticated: true, 
          token 
        });
      },
      logout: () => {
        localStorage.removeItem('auth-storage');
        set({ 
          user: null, 
          isAuthenticated: false, 
          token: null 
        });
      },
      checkAuth: () => {
        const state = get();
        if (!state.token || !state.user) {
          state.logout();
          return false;
        }
        return true;
      }
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