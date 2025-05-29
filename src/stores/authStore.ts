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
  isLoading: boolean;
  error: string | null;
  login: (user: User, token: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

// Token validation helper
const isValidToken = (token: string): boolean => {
  try {
    // Check if token follows the format "token_<userID>"
    return token.startsWith('token_') && token.length > 6;
  } catch {
    return false;
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      isLoading: false,
      error: null,
      
      login: async (user, token) => {
        try {
          set({ isLoading: true, error: null });
          
          if (!user || !token) {
            throw new Error('Invalid login data');
          }
          
          // Validate user data
          if (!user.id || !user.name || !user.email) {
            throw new Error('Invalid user data');
          }
          
          // Validate token format
          if (!isValidToken(token)) {
            throw new Error('Invalid token format');
          }
          
          set({ 
            user, 
            isAuthenticated: true, 
            token,
            isLoading: false
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed';
          set({ 
            error: errorMessage,
            isLoading: false 
          });
          throw new Error(errorMessage);
        }
      },
      
      logout: () => {
        set({ 
          user: null, 
          isAuthenticated: false, 
          token: null,
          error: null,
          isLoading: false
        });
      },
      
      checkAuth: async () => {
        const state = get();
        try {
          set({ isLoading: true, error: null });
          
          if (!state.token || !state.user) {
            state.logout();
            return false;
          }
          
          // Validate token format
          if (!isValidToken(state.token)) {
            state.logout();
            throw new Error('Invalid token format');
          }
          
          set({ isLoading: false });
          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Authentication check failed';
          set({ 
            error: errorMessage,
            isLoading: false 
          });
          state.logout();
          return false;
        }
      },
      
      setError: (error) => set({ error }),
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