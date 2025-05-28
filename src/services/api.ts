const API_URL = import.meta.env.VITE_API_URL || 'https://google-meet-clone-ma9v.onrender.com/api';

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

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return {
      success: false,
      data: null,
      error: 'Invalid response format: Expected JSON'
    };
  }

  const data = await response.json();
  
  if (!response.ok) {
    return {
      success: false,
      data: null,
      error: data.error || data.message || 'An error occurred'
    };
  }

  return {
    success: true,
    data: data.data,
    message: data.message
  };
}

async function fetchPublic<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
    
    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
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
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };
    
    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
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