import { create } from 'zustand';

export interface Message {
  sender: string;
  content: string;
  timestamp: number;
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  stream?: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isHost?: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  joinedAt: Date;
  lastActive: Date;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
  peerId: string;
}

interface MeetingState {
  meetingId: string | null;
  participants: Map<string, Participant>;
  messages: Message[];
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  error: string | null;
  setMeetingId: (id: string | null) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (id: string) => void;
  updateParticipant: (id: string, updates: Partial<Participant>) => void;
  addMessage: (sender: string, content: string) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenSharing: () => void;
  toggleChat: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetingId: null,
  participants: new Map(),
  messages: [],
  isAudioEnabled: true,
  isVideoEnabled: true,
  isScreenSharing: false,
  isChatOpen: false,
  error: null,

  setMeetingId: (id) => set({ meetingId: id }),

  addParticipant: (participant) =>
    set((state) => {
      const newParticipants = new Map(state.participants);
      newParticipants.set(participant.id, participant);
      return { participants: newParticipants };
    }),

  removeParticipant: (id) =>
    set((state) => {
      const newParticipants = new Map(state.participants);
      newParticipants.delete(id);
      return { participants: newParticipants };
    }),

  updateParticipant: (id, updates) =>
    set((state) => {
      const participant = state.participants.get(id);
      if (!participant) return state;

      const newParticipants = new Map(state.participants);
      newParticipants.set(id, { ...participant, ...updates });
      return { participants: newParticipants };
    }),

  addMessage: (sender, content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          sender,
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  toggleAudio: () =>
    set((state) => ({
      isAudioEnabled: !state.isAudioEnabled,
    })),

  toggleVideo: () =>
    set((state) => ({
      isVideoEnabled: !state.isVideoEnabled,
    })),

  toggleScreenSharing: () =>
    set((state) => ({
      isScreenSharing: !state.isScreenSharing,
    })),

  toggleChat: () =>
    set((state) => ({
      isChatOpen: !state.isChatOpen,
    })),

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  reset: () =>
    set({
      meetingId: null,
      participants: new Map(),
      messages: [],
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      isChatOpen: false,
      error: null,
    }),
}));