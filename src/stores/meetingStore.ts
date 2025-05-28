import { create } from 'zustand';

interface Participant {
  id: string;
  name: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

interface MeetingState {
  meetingId: string | null;
  participants: Participant[];
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  messages: Array<{ id: string; sender: string; content: string; timestamp: Date }>;
  
  setMeetingId: (id: string | null) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (id: string) => void;
  updateParticipant: (id: string, update: Partial<Participant>) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenSharing: () => void;
  toggleChat: () => void;
  addMessage: (sender: string, content: string) => void;
}

export const useMeetingStore = create<MeetingState>()((set) => ({
  meetingId: null,
  participants: [],
  isAudioEnabled: true,
  isVideoEnabled: true,
  isScreenSharing: false,
  isChatOpen: false,
  messages: [],
  
  setMeetingId: (id) => set({ meetingId: id }),
  
  addParticipant: (participant) => 
    set((state) => ({ 
      participants: [...state.participants, participant] 
    })),
  
  removeParticipant: (id) => 
    set((state) => ({ 
      participants: state.participants.filter(p => p.id !== id) 
    })),
  
  updateParticipant: (id, update) => 
    set((state) => ({ 
      participants: state.participants.map(p => 
        p.id === id ? { ...p, ...update } : p
      ) 
    })),
  
  toggleAudio: () => 
    set((state) => ({ isAudioEnabled: !state.isAudioEnabled })),
  
  toggleVideo: () => 
    set((state) => ({ isVideoEnabled: !state.isVideoEnabled })),
  
  toggleScreenSharing: () => 
    set((state) => ({ isScreenSharing: !state.isScreenSharing })),
  
  toggleChat: () => 
    set((state) => ({ isChatOpen: !state.isChatOpen })),
  
  addMessage: (sender, content) => 
    set((state) => ({ 
      messages: [...state.messages, { 
        id: crypto.randomUUID(), 
        sender, 
        content, 
        timestamp: new Date() 
      }] 
    })),
}));