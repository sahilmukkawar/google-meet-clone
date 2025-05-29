import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'https://google-meet-clone-ma9v.onrender.com/api';
const FRONTEND_URL = 'https://famous-sprite-14c531.netlify.app';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    createdAt?: string;
  };
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  createdByName?: string;
  isPrivate: boolean;
  password?: string;
  maxParticipants?: number;
  scheduledFor?: string;
  duration?: number; // in minutes
  status: 'scheduled' | 'active' | 'ended';
  createdAt: string;
  updatedAt?: string;
  participantCount?: number;
  settings?: MeetingSettings;
}

export interface MeetingSettings {
  allowChat: boolean;
  allowScreenShare: boolean;
  allowRecording: boolean;
  waitingRoom: boolean;
  muteOnJoin: boolean;
  cameraOnJoin: boolean;
}

export interface Participant {
  id: string;
  meetingId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  peerId: string;
  isHost: boolean;
  isCoHost?: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  joinedAt: string;
  lastActive: string;
  deviceInfo?: {
    browser: string;
    os: string;
    device: string;
  };
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  message: string;
  messageType: 'text' | 'file' | 'system';
  timestamp: string;
  isPrivate?: boolean;
  recipientId?: string;
}

export interface MeetingInvite {
  id: string;
  meetingId: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  invitedAt: string;
  respondedAt?: string;
}

export interface NetworkStats {
  peerId: string;
  connectionType: string;
  bandwidth: {
    upload: number;
    download: number;
  };
  latency: number;
  packetLoss: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

// Enhanced retry configuration
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  TIMEOUT: 15000,
  EXPONENTIAL_BACKOFF: true,
  MAX_DELAY: 10000,
};

// Request queue for managing concurrent requests
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private maxConcurrent = 5;
  private active = 0;

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          this.active++;
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.active--;
          this.processNext();
        }
      });
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.active < this.maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        request();
      }
    }
  }
}

const requestQueue = new RequestQueue();

// Enhanced helper functions
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const calculateRetryDelay = (attempt: number): number => {
  if (!RETRY_CONFIG.EXPONENTIAL_BACKOFF) return RETRY_CONFIG.RETRY_DELAY;
  
  const exponentialDelay = RETRY_CONFIG.RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.MAX_DELAY);
};

// Enhanced server health check with detailed diagnostics
async function checkServerHealth(): Promise<{
  isHealthy: boolean;
  responseTime: number;
  status?: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
      mode: 'cors',
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      isHealthy: response.ok,
      responseTime,
      status: response.status,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.warn('Server health check failed:', error);
    
    return {
      isHealthy: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Enhanced response handler with better error categorization
async function handleResponse<T>(response: Response, retryCount = 0): Promise<ApiResponse<T>> {
  try {
    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
        await delay(calculateRetryDelay(retryCount));
        return handleResponse<T>(response, retryCount + 1);
      }
      return {
        success: false,
        error: 'Server returned invalid response format',
      };
    }

    // Parse JSON response
    let data: any;
    try {
      const text = await response.text();
      if (!text.trim()) {
        return {
          success: false,
          error: 'Server returned empty response',
        };
      }
      data = JSON.parse(text);
    } catch (parseError) {
      if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
        await delay(calculateRetryDelay(retryCount));
        return handleResponse<T>(response, retryCount + 1);
      }
      return {
        success: false,
        error: 'Failed to parse server response',
      };
    }

    // Handle different HTTP status codes
    if (!response.ok) {
      switch (response.status) {
        case 401:
          // Clear auth state and redirect to login
          localStorage.removeItem('auth-token');
          const authStore = useAuthStore.getState();
          authStore.logout();
          
          return {
            success: false,
            error: 'Your session has expired. Please log in again.',
          };

        case 403:
          return {
            success: false,
            error: 'You don\'t have permission to perform this action.',
          };

        case 404:
          return {
            success: false,
            error: 'The requested resource was not found.',
          };

        case 409:
          return {
            success: false,
            error: data.error || 'A conflict occurred. The resource may already exist.',
          };

        case 429:
          return {
            success: false,
            error: 'Too many requests. Please wait a moment and try again.',
          };

        case 500:
        case 502:
        case 503:
        case 504:
          if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
            await delay(calculateRetryDelay(retryCount));
            return handleResponse<T>(response, retryCount + 1);
          }
          return {
            success: false,
            error: 'Server is temporarily unavailable. Please try again later.',
          };

        default:
          return {
            success: false,
            error: data.error || data.message || `Request failed with status ${response.status}`,
          };
      }
    }

    // Return successful response
    return {
      success: true,
      data,
      message: data.message,
    };
  } catch (error) {
    if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
      await delay(calculateRetryDelay(retryCount));
      return handleResponse<T>(response, retryCount + 1);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

// Enhanced fetch with timeout and better error handling
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.TIMEOUT);

  try {
    // Get browser and device info for better debugging
    const userAgent = navigator.userAgent;
    const clientInfo = {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      userAgent: userAgent,
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': FRONTEND_URL,
      'X-Client-Info': JSON.stringify(clientInfo),
      'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      mode: 'cors',
      credentials: 'include',
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your internet connection.');
      }
      if (error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
    }
    
    throw error;
  }
}

// Public API calls (no authentication required)
async function fetchPublic<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  return requestQueue.add(async () => {
    try {
      // Check server health before making request
      const healthCheck = await checkServerHealth();
      if (!healthCheck.isHealthy) {
        return {
          success: false,
          error: `Server is not responding (${healthCheck.responseTime}ms). Please try again later.`,
        };
      }

      const response = await fetchWithTimeout(`${API_URL}${url}`, {
        ...options,
        mode: 'cors',
        credentials: 'include',
      });
      
      return handleResponse<T>(response);
    } catch (error) {
      console.error('Public API Error:', error);
      return { 
        success: false,
        error: error instanceof Error ? error.message : 'Network error occurred',
      };
    }
  });
}

// Authenticated API calls
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  return requestQueue.add(async () => {
    const token = localStorage.getItem('auth-token');
    if (!token) {
      return {
        success: false,
        error: 'Authentication required. Please log in.',
      };
    }

    try {
      const response = await fetchWithTimeout(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': FRONTEND_URL,
          ...options.headers,
        },
        mode: 'cors',
        credentials: 'include',
      });

      return handleResponse<T>(response);
    } catch (error) {
      console.error('Authenticated API Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    }
  });
}

// Enhanced API object with comprehensive endpoints
export const api = {
  // Authentication endpoints
  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': FRONTEND_URL,
        },
        body: JSON.stringify({ email, password }),
        mode: 'cors',
        credentials: 'include',
      });

      const result = await handleResponse<AuthResponse>(response);
      
      if (result.success && result.data) {
        localStorage.setItem('auth-token', result.data.token);
        // Store user info for offline access
        localStorage.setItem('user-info', JSON.stringify(result.data.user));
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
          'Origin': FRONTEND_URL,
        },
        body: JSON.stringify({ name, email, password }),
        mode: 'cors',
        credentials: 'include',
      });

      const result = await handleResponse<AuthResponse>(response);
      
      if (result.success && result.data) {
        localStorage.setItem('auth-token', result.data.token);
        localStorage.setItem('user-info', JSON.stringify(result.data.user));
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

  async logout(): Promise<ApiResponse<void>> {
    try {
      const result = await fetchWithAuth<void>('/auth/logout', {
        method: 'POST',
      });
      
      // Always clear local storage regardless of API response
      localStorage.removeItem('auth-token');
      localStorage.removeItem('user-info');
      
      return result;
    } catch (error) {
      // Clear local storage even if logout request fails
      localStorage.removeItem('auth-token');
      localStorage.removeItem('user-info');
      
      return {
        success: true, // Consider logout successful even if API call fails
      };
    }
  },

  async refreshToken(): Promise<ApiResponse<AuthResponse>> {
    return fetchWithAuth<AuthResponse>('/auth/refresh', {
      method: 'POST',
    });
  },

  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    return fetchPublic<void>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, password: string): Promise<ApiResponse<void>> {
    return fetchPublic<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
  
  // Meeting endpoints
  async createMeeting(meetingData: {
    title: string;
    description?: string;
    scheduledFor?: Date;
    duration?: number;
    isPrivate?: boolean;
    password?: string;
    maxParticipants?: number;
    settings?: Partial<MeetingSettings>;
  }): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>('/meetings', {
      method: 'POST',
      body: JSON.stringify({
        ...meetingData,
        scheduledFor: meetingData.scheduledFor?.toISOString(),
        settings: {
          allowChat: true,
          allowScreenShare: true,
          allowRecording: false,
          waitingRoom: false,
          muteOnJoin: false,
          cameraOnJoin: true,
          ...meetingData.settings,
        },
      }),
    });
  },
  
  async getMeeting(id: string): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>(`/meetings/${id}`);
  },

  async getMeetingByInviteCode(inviteCode: string): Promise<ApiResponse<Meeting>> {
    return fetchPublic<Meeting>(`/meetings/invite/${inviteCode}`);
  },
  
  async getMeetings(params?: {
    page?: number;
    limit?: number;
    status?: Meeting['status'];
    search?: string;
  }): Promise<ApiResponse<{ meetings: Meeting[]; total: number; page: number; totalPages: number }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);

    const url = `/meetings${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return fetchWithAuth<{ meetings: Meeting[]; total: number; page: number; totalPages: number }>(url);
  },

  async updateMeeting(id: string, updates: Partial<Meeting>): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>(`/meetings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async deleteMeeting(id: string): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${id}`, {
      method: 'DELETE',
    });
  },

  async startMeeting(id: string): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>(`/meetings/${id}/start`, {
      method: 'POST',
    });
  },

  async endMeeting(id: string): Promise<ApiResponse<Meeting>> {
    return fetchWithAuth<Meeting>(`/meetings/${id}/end`, {
      method: 'POST',
    });
  },

  // Meeting participant endpoints
  async joinMeeting(meetingId: string, data: {
    peerId: string;
    password?: string;
    deviceInfo?: Participant['deviceInfo'];
  }): Promise<ApiResponse<{ meeting: Meeting; participant: Participant }>> {
    return fetchWithAuth<{ meeting: Meeting; participant: Participant }>(`/meetings/${meetingId}/join`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async leaveMeeting(meetingId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/leave`, {
      method: 'POST',
    });
  },
  
  async getParticipants(meetingId: string): Promise<ApiResponse<Participant[]>> {
    return fetchWithAuth<Participant[]>(`/meetings/${meetingId}/participants`);
  },

  async updateParticipant(
    meetingId: string,
    updates: Partial<Participant>
  ): Promise<ApiResponse<Participant>> {
    return fetchWithAuth<Participant>(`/meetings/${meetingId}/participants`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async removeParticipant(meetingId: string, participantId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/participants/${participantId}`, {
      method: 'DELETE',
    });
  },

  async promoteToCoHost(meetingId: string, participantId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/participants/${participantId}/promote`, {
      method: 'POST',
    });
  },

  // Chat endpoints
  async getChatMessages(meetingId: string, params?: {
    page?: number;
    limit?: number;
    since?: string;
  }): Promise<ApiResponse<{ messages: ChatMessage[]; hasMore: boolean }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.since) queryParams.append('since', params.since);

    const url = `/meetings/${meetingId}/chat${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return fetchWithAuth<{ messages: ChatMessage[]; hasMore: boolean }>(url);
  },

  async sendChatMessage(meetingId: string, data: {
    message: string;
    messageType?: ChatMessage['messageType'];
    recipientId?: string;
  }): Promise<ApiResponse<ChatMessage>> {
    return fetchWithAuth<ChatMessage>(`/meetings/${meetingId}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Invitation endpoints
  async inviteParticipants(meetingId: string, emails: string[]): Promise<ApiResponse<MeetingInvite[]>> {
    return fetchWithAuth<MeetingInvite[]>(`/meetings/${meetingId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
  },

  async getInvites(meetingId: string): Promise<ApiResponse<MeetingInvite[]>> {
    return fetchWithAuth<MeetingInvite[]>(`/meetings/${meetingId}/invites`);
  },

  async respondToInvite(inviteId: string, response: 'accepted' | 'declined'): Promise<ApiResponse<void>> {
    return fetchPublic<void>(`/invites/${inviteId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
  },

  // User profile endpoints
  async getProfile(): Promise<ApiResponse<AuthResponse['user']>> {
    return fetchWithAuth<AuthResponse['user']>('/auth/profile');
  },

  async updateProfile(updates: {
    name?: string;
    email?: string;
    avatar?: string;
  }): Promise<ApiResponse<AuthResponse['user']>> {
    return fetchWithAuth<AuthResponse['user']>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // WebRTC signaling endpoints
  async sendSignal(meetingId: string, data: {
    type: 'offer' | 'answer' | 'ice-candidate';
    targetPeerId: string;
    signal: any;
  }): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/signal`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getSignals(meetingId: string, peerId: string): Promise<ApiResponse<any[]>> {
    return fetchWithAuth<any[]>(`/meetings/${meetingId}/signals/${peerId}`);
  },

  // Network and quality endpoints
  async reportNetworkStats(meetingId: string, stats: NetworkStats): Promise<ApiResponse<void>> {
    return fetchWithAuth<void>(`/meetings/${meetingId}/network-stats`, {
      method: 'POST',
      body: JSON.stringify(stats),
    });
  },

  async getMeetingStats(meetingId: string): Promise<ApiResponse<{
    participantCount: number;
    duration: number;
    networkQuality: Record<string, NetworkStats>;
    averageLatency: number;
  }>> {
    return fetchWithAuth<{
      participantCount: number;
      duration: number;
      networkQuality: Record<string, NetworkStats>;
      averageLatency: number;
    }>(`/meetings/${meetingId}/stats`);
  },

  // File upload endpoint
  async uploadFile(file: File, meetingId?: string): Promise<ApiResponse<{
    url: string;
    filename: string;
    size: number;
    type: string;
  }>> {
    const formData = new FormData();
    formData.append('file', file);
    if (meetingId) formData.append('meetingId', meetingId);

    return fetchWithAuth<{
      url: string;
      filename: string;
      size: number;
      type: string;
    }>('/upload', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  },

  // Health check endpoint
  async checkHealth(): Promise<ApiResponse<{
    status: string;
    timestamp: string;
    version?: string;
  }>> {
    return fetchPublic<{
      status: string;
      timestamp: string;
      version?: string;
    }>('/health');
  },
};