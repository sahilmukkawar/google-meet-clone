const API_URL = import.meta.env.VITE_API_URL || 'https://google-meet-clone-ma9v.onrender.com/api';
const FRONTEND_URL = 'https://famous-sprite-14c531.netlify.app';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message?: string;
  error?: string;
}

interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
  token: string;
}

interface MeetingResponse {
  id: string;
  title: string;
  createdBy: string;
  scheduledFor?: string;
  createdAt: string;
  isPrivate: boolean;
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
    const response = await fetch(`${API_URL.replace('/api', '')}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      mode: 'cors',
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
        data: null,
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
          data: null,
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
        data: null,
        error: 'Failed to parse server response'
      };
    }

    // Handle error responses
    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: data.error || data.message || 'An error occurred'
      };
    }

    // Return successful response
    return {
      success: true,
      data: data.data,
      message: data.message
    };
  } catch (error) {
    // If any error occurs and we haven't exceeded retry limit, try again
    if (retryCount < MAX_RETRIES) {
      await delay(RETRY_DELAY);
      return handleResponse<T>(response, retryCount + 1);
    }
    return {
      success: false,
      data: null,
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
        data: null,
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
      data: null, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    // Check server health first
    const isHealthy = await checkServerHealth();
    if (!isHealthy) {
      return {
        success: false,
        data: null,
        error: 'Server is not responding. Please try again later.'
      };
    }

    const authStorage = localStorage.getItem('auth-storage');
    if (!authStorage) {
      return { 
        success: false, 
        data: null, 
        error: 'No authentication found' 
      };
    }

    const { state } = JSON.parse(authStorage);
    const token = state?.token;
    
    if (!token) {
      return { 
        success: false, 
        data: null, 
        error: 'No token found' 
      };
    }
    
    const response = await fetchWithTimeout(`${API_URL}${url}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': FRONTEND_URL,
        ...options.headers,
      },
      mode: 'cors',
      credentials: 'include',
    });
    
    if (response.status === 401) {
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
      return {
        success: false,
        data: null,
        error: 'Session expired. Please login again.'
      };
    }
    
    return handleResponse<T>(response);
  } catch (error) {
    console.error('API Error:', error);
    return { 
      success: false,
      data: null, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

export const api = {
  // Auth endpoints
  login: async (email: string, password: string) => {
    return fetchPublic<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  
  register: async (name: string, email: string, password: string) => {
    return fetchPublic<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },
  
  // Meeting endpoints
  createMeeting: async (title: string, scheduledFor?: string, isPrivate: boolean = false) => {
    return fetchWithAuth<{id: string}>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ title, scheduledFor, isPrivate }),
    });
  },
  
  getMeeting: async (id: string) => {
    return fetchWithAuth<MeetingResponse>(`/meetings/${id}`);
  },
  
  getMeetings: async () => {
    return fetchWithAuth<MeetingResponse[]>('/meetings');
  },
  
  // User endpoints
  getProfile: async () => {
    return fetchWithAuth('/users/profile');
  },
};