import { create } from 'zustand';
import { Participant } from '../services/meeting';

interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
}

interface MeetingState {
  // Meeting info
  meetingId: string | null;
  participants: Participant[];
  
  // UI states
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isFullscreen: boolean;
  
  // Chat
  messages: ChatMessage[];
  
  // Meeting controls
  isRecording: boolean;
  isHandRaised: boolean;
  
  // Layout
  currentLayout: 'grid' | 'speaker' | 'sidebar';
  pinnedParticipant: string | null;
  
  // Actions
  setMeetingId: (id: string | null) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  clearParticipants: () => void;
  
  // UI actions
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenSharing: () => void;
  toggleChat: () => void;
  toggleFullscreen: () => void;
  
  // Chat actions
  addMessage: (sender: string, content: string) => void;
  clearMessages: () => void;
  
  // Meeting control actions
  toggleRecording: () => void;
  toggleHandRaise: () => void;
  
  // Layout actions
  setLayout: (layout: 'grid' | 'speaker' | 'sidebar') => void;
  setPinnedParticipant: (participantId: string | null) => void;
  
  // Getters
  getParticipant: (participantId: string) => Participant | undefined;
  getLocalParticipant: () => Participant | undefined;
  getRemoteParticipants: () => Participant[];
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  // Initial state
  meetingId: null,
  participants: [],
  
  isAudioEnabled: true,
  isVideoEnabled: true,
  isScreenSharing: false,
  isChatOpen: false,
  isFullscreen: false,
  
  messages: [],
  
  isRecording: false,
  isHandRaised: false,
  
  currentLayout: 'grid',
  pinnedParticipant: null,
  
  // Meeting actions
  setMeetingId: (id) => set({ meetingId: id }),
  
  addParticipant: (participant) => set((state) => {
    // Check if participant already exists
    const existingIndex = state.participants.findIndex(p => p.id === participant.id);
    if (existingIndex >= 0) {
      // Update existing participant
      const updatedParticipants = [...state.participants];
      updatedParticipants[existingIndex] = { ...updatedParticipants[existingIndex], ...participant };
      return { participants: updatedParticipants };
    }
    // Add new participant
    return { participants: [...state.participants, participant] };
  }),
  
  removeParticipant: (participantId) => set((state) => ({
    participants: state.participants.filter(p => p.id !== participantId),
    // Unpin if the removed participant was pinned
    pinnedParticipant: state.pinnedParticipant === participantId ? null : state.pinnedParticipant,
  })),
  
  updateParticipant: (participantId, updates) => set((state) => ({
    participants: state.participants.map(p => 
      p.id === participantId ? { ...p, ...updates } : p
    ),
  })),
  
  clearParticipants: () => set({ 
    participants: [],
    pinnedParticipant: null,
  }),
  
  // UI actions
  toggleAudio: () => set((state) => ({ 
    isAudioEnabled: !state.isAudioEnabled 
  })),
  
  toggleVideo: () => set((state) => ({ 
    isVideoEnabled: !state.isVideoEnabled 
  })),
  
  toggleScreenSharing: () => set((state) => ({ 
    isScreenSharing: !state.isScreenSharing 
  })),
  
  toggleChat: () => set((state) => ({ 
    isChatOpen: !state.isChatOpen 
  })),
  
  toggleFullscreen: () => set((state) => ({ 
    isFullscreen: !state.isFullscreen 
  })),
  
  // Chat actions
  addMessage: (sender, content) => set((state) => ({
    messages: [
      ...state.messages,
      {
        id: Date.now().toString(),
        sender,
        content,
        timestamp: new Date(),
      },
    ],
  })),
  
  clearMessages: () => set({ messages: [] }),
  
  // Meeting control actions
  toggleRecording: () => set((state) => ({ 
    isRecording: !state.isRecording 
  })),
  
  toggleHandRaise: () => set((state) => ({ 
    isHandRaised: !state.isHandRaised 
  })),
  
  // Layout actions
  setLayout: (layout) => set({ currentLayout: layout }),
  
  setPinnedParticipant: (participantId) => set({ 
    pinnedParticipant: participantId 
  }),
  
  // Getters
  getParticipant: (participantId) => {
    const state = get();
    return state.participants.find(p => p.id === participantId);
  },
  
  getLocalParticipant: () => {
    const state = get();
    return state.participants.find(p => p.isHost);
  },
  
  getRemoteParticipants: () => {
    const state = get();
    return state.participants.filter(p => !p.isHost);
  },
}));