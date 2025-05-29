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
    // Basic JWT token validation
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    // Check if token is expired
    const payload = JSON.parse(atob(parts[1]));
    const expirationTime = payload.exp * 1000; // Convert to milliseconds
    return Date.now() < expirationTime;
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
          
          // Validate token format and expiration
          if (!isValidToken(token)) {
            throw new Error('Invalid or expired token');
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
          
          // Validate token on each auth check
          if (!isValidToken(state.token)) {
            state.logout();
            throw new Error('Session expired');
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