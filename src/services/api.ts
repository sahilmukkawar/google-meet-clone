import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'https://google-meet-clone-ma9v.onrender.com/api';
const FRONTEND_URL = 'https://famous-sprite-14c531.netlify.app';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Meeting {
  id: string;
  title: string;
  createdBy: string;
  isPrivate: boolean;
  createdAt: string;
}

export interface Participant {
  id: string;
  meetingId: string;
  userId: string;
  peerId: string;
  isHost: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  lastActive: string;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const TIMEOUT = 10000; // 10 seconds

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check if server is reachable
async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'include',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    console.error('Server health check failed:', error);
    return false;
  }
}

async function handleResponse<T>(response: Response, retryCount = 0): Promise<ApiResponse<T>> {
  try {
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // If we haven't exceeded retry limit, try again
      if (retryCount < MAX_RETRIES) {
        await delay(RETRY_DELAY);
        return handleResponse<T>(response, retryCount + 1);
      }
      return {
        success: false,
        error: 'Invalid response format: Expected JSON'
      };
    }

    // Try to parse JSON
    let data;
    try {
      const text = await response.text();
      if (!text) {
        return {
          success: false,
          error: 'Empty response received'
        };
      }
      data = JSON.parse(text);
    } catch (e) {
      // If JSON parsing fails and we haven't exceeded retry limit, try again
      if (retryCount < MAX_RETRIES) {
        await delay(RETRY_DELAY);
        return handleResponse<T>(response, retryCount + 1);
      }
      return {
        success: false,
        error: 'Failed to parse server response'
      };
    }

    // Handle error responses
    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'An error occurred'
      };
    }

    // Return successful response
    return {
      success: true,
      data,
    };
  } catch (error) {
    // If any error occurs and we haven't exceeded retry limit, try again
    if (retryCount < MAX_RETRIES) {
      await delay(RETRY_DELAY);
      return handleResponse<T>(response, retryCount + 1);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    // Ensure headers are properly set
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': FRONTEND_URL,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      mode: 'cors',
      credentials: 'include',
    });

    // Check for network errors
    if (!response.ok && !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchPublic<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    // Check server health first
    const isHealthy = await checkServerHealth();
    if (!isHealthy) {
      return {
        success: false,
        error: 'Server is not responding. Please try again later.'
      };
    }

    const response = await fetchWithTimeout(`${API_URL}${url}`, {
      ...options,
      mode: 'cors',
      credentials: 'include',
    });
    
    return handleResponse<T>(response);
  } catch (error) {
    console.error('API Error:', error);
    return { 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('auth-token');
  if (!token) {
    return {
      success: false,
      error: 'Authentication token not found. Please log in again.',
    };
  }

  try {
    const response = await fetchWithTimeout(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Origin': FRONTEND_URL,
        ...options.headers,
      },
      mode: 'cors',
      credentials: 'include',
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      localStorage.removeItem('auth-token');
      return {
        success: false,
        error: 'Session expired. Please log in again.',
      };
    }

    return handleResponse<T>(response);
  } catch (error) {
    console.error('API Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export const api = {
  // Auth endpoints
  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': FRONTEND_URL,
        },
        body: JSON.stringify({ email, password }),
        mode: 'cors',
        credentials: 'include',
      });

      const result = await handleResponse<AuthResponse>(response);
      if (result.success && result.data?.token) {
        localStorage.setItem('auth-token', result.data.token);
      }
      return result;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  },
  
  async register(name: string, email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': FRONTEND_URL,
        },
        body: JSON.stringify({ name, email, password }),
        mode: 'cors',
        credentials: 'include',
      });

      const result = await handleResponse<AuthResponse>(response);
      if (result.success && result.data?.token) {
        localStorage.setItem('auth-token', result.data.token);
      }
      return result;
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  },
  
  // Meeting endpoints
  async createMeeting(title: string, isPrivate: boolean): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ title, isPrivate }),
    });
  },
  
  async getMeeting(id: string): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>(`/meetings/${id}`);
  },
  
  async getMeetings(): Promise<ApiResponse<Meeting[]>> {
    return fetchWithAuth<Meeting[]>('/meetings');
  },

  // Meeting participant endpoints
  async notifyJoin(meetingId: string, peerId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/join`, {
      method: 'POST',
      body: JSON.stringify({ peerId }),
    });
  },
  
  // User endpoints
  async getProfile(): Promise<ApiResponse<AuthResponse['user']>> {
    return fetchWithAuth<AuthResponse['user']>('/auth/profile');
  },

  async getParticipants(meetingId: string): Promise<ApiResponse<Participant[]>> {
    return fetchWithAuth<Participant[]>(`/meetings/${meetingId}/participants`);
  },

  async updateParticipant(
    meetingId: string,
    updates: Partial<Participant>
  ): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/participants`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async sendIceCandidate(
    meetingId: string,
    candidate: RTCIceCandidateInit
  ): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/ice-candidate`, {
      method: 'POST',
      body: JSON.stringify({ candidate }),
    });
  },
};