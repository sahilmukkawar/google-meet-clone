import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { useMeetingStore } from '../stores/meetingStore';
import { useAuthStore } from '../stores/authStore';
import { api } from './api';

export interface Participant {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  stream?: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isHost?: boolean;
  isCoHost?: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  joinedAt: Date;
  lastActive: Date;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
  peerId: string;
}

export interface MeetingSettings {
  quality: 'low' | 'medium' | 'high' | 'auto';
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  enableBackgroundBlur: boolean;
  maxParticipants: number;
}

export type MeetingEventType = 
  | 'participant-joined'
  | 'participant-left'
  | 'participant-updated'
  | 'stream-added'
  | 'stream-removed'
  | 'connection-quality-changed'
  | 'meeting-ended'
  | 'error'
  | 'reconnecting'
  | 'reconnected'
  | 'chat-message'
  | 'hand-raised'
  | 'hand-lowered'
  | 'screen-share-started'
  | 'screen-share-ended';

export interface MeetingEvent {
  type: MeetingEventType;
  data?: any;
  timestamp: Date;
  participantId?: string;
}

export class MeetingService {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private calls: Map<string, MediaConnection> = new Map();
  private dataConnections: Map<string, DataConnection> = new Map();
  private meetingId: string | null = null;
  private isInitialized = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private eventListeners: Map<MeetingEventType, ((event: MeetingEvent) => void)[]> = new Map();
  private settings: MeetingSettings = {
    quality: 'auto',
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    enableBackgroundBlur: false,
    maxParticipants: 50,
  };

  constructor() {
    this.handleIncomingCall = this.handleIncomingCall.bind(this);
    this.handleDataConnection = this.handleDataConnection.bind(this);
  }

  // Event management
  addEventListener(type: MeetingEventType, callback: (event: MeetingEvent) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(callback);
  }

  removeEventListener(type: MeetingEventType, callback: (event: MeetingEvent) => void): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emitEvent(type: MeetingEventType, data?: any, participantId?: string): void {
    const event: MeetingEvent = {
      type,
      data,
      timestamp: new Date(),
      participantId,
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
  }

  async initializeMeeting(meetingId: string, settings?: Partial<MeetingSettings>): Promise<boolean> {
    try {
      const { user } = useAuthStore.getState();
      if (!user) throw new Error('User not authenticated');

      this.meetingId = meetingId;
      this.settings = { ...this.settings, ...settings };
      
      const peerId = `${user.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      this.peer = new Peer(peerId, {
        host: import.meta.env.VITE_PEER_HOST || 'peerjs.com',
        port: import.meta.env.VITE_PEER_PORT ? Number(import.meta.env.VITE_PEER_PORT) : 443,
        path: import.meta.env.VITE_PEER_PATH || '/',
        secure: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
          ],
          iceCandidatePoolSize: 10,
          bundlePolicy: 'balanced',
          rtcpMuxPolicy: 'require',
        },
        debug: import.meta.env.DEV ? 2 : 0,
      });

      await this.setupPeerEventHandlers();
      await this.getLocalStream();

      const { setMeetingId, addParticipant } = useMeetingStore.getState();
      setMeetingId(meetingId);

      addParticipant({
        id: peerId,
        name: user.name,
        email: user.email,
        stream: this.localStream || undefined,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        isHandRaised: false,
        isHost: true,
        connectionStatus: 'connected',
        joinedAt: new Date(),
        lastActive: new Date(),
        networkQuality: 'excellent',
        peerId,
      });

      await this.notifyServerJoin(meetingId, peerId);

      this.isInitialized = true;
      this.emitEvent('participant-joined', { participantId: peerId });
      return true;
    } catch (error) {
      console.error('Failed to initialize meeting:', error);
      this.emitEvent('error', { error: error instanceof Error ? error.message : 'Initialization failed' });
      return false;
    }
  }

  private async notifyServerJoin(meetingId: string, peerId: string): Promise<void> {
    try {
      await api.joinMeeting(meetingId, { peerId });
    } catch (error) {
      console.error('Failed to notify server about join:', error);
      this.emitEvent('error', { error: 'Failed to connect to server' });
    }
  }

  private async setupPeerEventHandlers(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      this.peer.on('open', (id) => {
        console.log('Peer connected with ID:', id);
        this.reconnectAttempts = 0;
        resolve();
      });

      this.peer.on('call', this.handleIncomingCall);
      this.peer.on('connection', this.handleDataConnection);

      this.peer.on('error', (error) => {
        console.error('Peer error:', error);
        if (!this.isInitialized) reject(error);
        this.handlePeerError(error);
      });

      this.peer.on('disconnected', () => {
        console.log('Peer disconnected');
        this.handleDisconnection();
      });

      this.peer.on('close', () => {
        console.log('Peer connection closed');
        this.handleDisconnection();
      });

      setTimeout(() => {
        if (!this.isInitialized) {
          reject(new Error('Peer connection timeout'));
        }
      }, 15000);
    });
  }

  private handlePeerError(error: any): void {
    const { setError } = useMeetingStore.getState();
    
    switch (error.type) {
      case 'peer-unavailable':
        this.emitEvent('error', { error: 'Peer is not available. They may have left the meeting.' });
        break;
      case 'network':
        this.emitEvent('error', { error: 'Network error. Attempting to reconnect...' });
        this.handleDisconnection();
        break;
      case 'server-error':
        this.emitEvent('error', { error: 'Server error. Please try rejoining the meeting.' });
        break;
      case 'socket-error':
        this.emitEvent('error', { error: 'Connection error. Checking network...' });
        this.handleDisconnection();
        break;
      default:
        this.emitEvent('error', { error: 'Connection error. Please try rejoining the meeting.' });
    }
  }

  private handleDisconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      this.emitEvent('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts });

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }

      this.reconnectTimeout = window.setTimeout(() => {
        this.reconnectPeer();
      }, delay);
    } else {
      this.emitEvent('error', { error: 'Connection lost. Please refresh the page to rejoin.' });
    }
  }

  private reconnectPeer(): void {
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.reconnect();
        this.emitEvent('reconnected');
      } catch (error) {
        console.error('Failed to reconnect peer:', error);
        this.handleDisconnection();
      }
    }
  }

  private async getLocalStream(): Promise<void> {
    try {
      const constraints = {
        video: this.getVideoConstraints(),
        audio: this.getAudioConstraints(),
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.error('Failed to access media devices:', error);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch (fallbackError) {
        console.error('Fallback media access failed:', fallbackError);
        this.emitEvent('error', { error: 'Failed to access camera and microphone' });
        throw fallbackError;
      }
    }
  }

  private getVideoConstraints(): MediaTrackConstraints {
    const baseConstraints: MediaTrackConstraints = {
      facingMode: 'user',
    };

    switch (this.settings.quality) {
      case 'low':
        return {
          ...baseConstraints,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        };
      case 'medium':
        return {
          ...baseConstraints,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        };
      case 'high':
        return {
          ...baseConstraints,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        };
      case 'auto':
      default:
        return {
          ...baseConstraints,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        };
    }
  }

  private getAudioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: this.settings.echoCancellation,
      noiseSuppression: this.settings.noiseSuppression,
      autoGainControl: this.settings.autoGainControl,
      sampleRate: 48000,
      channelCount: 2,
    };
  }

  private handleIncomingCall(call: MediaConnection): void {
    console.log('Incoming call from:', call.peer);
    if (!this.localStream) return;

    call.answer(this.localStream);
    this.calls.set(call.peer, call);

    call.on('stream', (remoteStream: MediaStream) => {
      console.log('Received remote stream:', call.peer);
      this.addRemoteParticipant(call.peer, remoteStream);
      this.emitEvent('stream-added', { peerId: call.peer, stream: remoteStream });
    });

    call.on('close', () => {
      this.removeParticipant(call.peer);
      this.calls.delete(call.peer);
      this.emitEvent('stream-removed', { peerId: call.peer });
    });

    call.on('error', (error: any) => {
      console.error('Call error:', error);
      this.removeParticipant(call.peer);
      this.calls.delete(call.peer);
      this.emitEvent('error', { error: `Call error with ${call.peer}` });
    });
  }

  private handleDataConnection(conn: DataConnection): void {
    console.log('Data connection from:', conn.peer);
    this.dataConnections.set(conn.peer, conn);
    
    conn.on('data', (data: any) => {
      this.handleDataMessage(conn.peer, data);
    });

    conn.on('close', () => {
      console.log('Data connection closed:', conn.peer);
      this.dataConnections.delete(conn.peer);
    });

    conn.on('error', (error: any) => {
      console.error('Data connection error:', error);
      this.dataConnections.delete(conn.peer);
    });
  }

  private handleDataMessage(peerId: string, data: any): void {
    switch (data.type) {
      case 'chat':
        this.emitEvent('chat-message', {
          message: data.message,
          senderId: peerId,
          senderName: data.senderName,
          timestamp: new Date(data.timestamp),
        });
        break;

      case 'participant-update':
        const { updateParticipant } = useMeetingStore.getState();
        updateParticipant(data.participantId, data.updates);
        this.emitEvent('participant-updated', { participantId: data.participantId, updates: data.updates });
        break;

      case 'hand-raised':
        this.emitEvent('hand-raised', { participantId: peerId });
        break;

      case 'hand-lowered':
        this.emitEvent('hand-lowered', { participantId: peerId });
        break;

      case 'screen-share-started':
        this.emitEvent('screen-share-started', { participantId: peerId });
        break;

      case 'screen-share-ended':
        this.emitEvent('screen-share-ended', { participantId: peerId });
        break;

      default:
        console.log('Unknown data message type:', data.type);
    }
  }

  private addRemoteParticipant(peerId: string, stream: MediaStream): void {
    const { addParticipant } = useMeetingStore.getState();
    addParticipant({
      id: peerId,
      name: `User ${peerId.slice(0, 8)}`,
      stream,
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      isHandRaised: false,
      isHost: false,
      connectionStatus: 'connected',
      joinedAt: new Date(),
      lastActive: new Date(),
      networkQuality: 'good',
      peerId,
    });
  }

  private removeParticipant(peerId: string): void {
    const { removeParticipant } = useMeetingStore.getState();
    removeParticipant(peerId);
    this.emitEvent('participant-left', { participantId: peerId });
  }

  async callPeer(peerId: string): Promise<boolean> {
    try {
      if (!this.peer || !this.localStream) throw new Error('Peer or stream missing');

      const call = this.peer.call(peerId, this.localStream);
      if (!call) throw new Error('Call could not be established');

      this.calls.set(peerId, call);

      // Set up data connection
      const dataConn = this.peer.connect(peerId);
      this.dataConnections.set(peerId, dataConn);

      call.on('stream', (remoteStream: MediaStream) => {
        this.addRemoteParticipant(peerId, remoteStream);
        this.emitEvent('stream-added', { peerId, stream: remoteStream });
      });

      call.on('close', () => {
        this.removeParticipant(peerId);
        this.calls.delete(peerId);
        this.dataConnections.delete(peerId);
        this.emitEvent('stream-removed', { peerId });
      });

      call.on('error', (error: any) => {
        console.error('Call error:', error);
        this.removeParticipant(peerId);
        this.calls.delete(peerId);
        this.dataConnections.delete(peerId);
        this.emitEvent('error', { error: `Call error with ${peerId}` });
      });

      return true;
    } catch (error) {
      console.error('Error calling peer:', error);
      this.emitEvent('error', { error: `Failed to connect to peer ${peerId}` });
      return false;
    }
  }

  toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    const isEnabled = audioTracks[0]?.enabled ?? true;
    const newState = !isEnabled;

    audioTracks.forEach(track => (track.enabled = newState));
    const { toggleAudio } = useMeetingStore.getState();
    toggleAudio();

    this.broadcastParticipantUpdate({ isAudioEnabled: newState });
    return newState;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    const isEnabled = videoTracks[0]?.enabled ?? true;
    const newState = !isEnabled;

    videoTracks.forEach(track => (track.enabled = newState));
    const { toggleVideo } = useMeetingStore.getState();
    toggleVideo();

    this.broadcastParticipantUpdate({ isVideoEnabled: newState });
    return newState;
  }

  private broadcastParticipantUpdate(updates: Partial<Participant>): void {
    if (!this.peer) return;

    const data = {
      type: 'participant-update',
      participantId: this.peer.id,
      updates,
    };

    for (const [, conn] of this.dataConnections) {
      conn.send(data);
    }
  }

  async toggleScreenShare(): Promise<boolean> {
    try {
      const { isScreenSharing, toggleScreenSharing } = useMeetingStore.getState();

      if (!isScreenSharing) {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          } as MediaTrackConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        const videoTrack = this.screenStream.getVideoTracks()[0];

        for (const [, call] of this.calls) {
          const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(videoTrack);
        }

        videoTrack.onended = () => {
          this.stopScreenShare();
        };

        if (this.localStream) {
          const oldVideoTrack = this.localStream.getVideoTracks()[0];
          if (oldVideoTrack) {
            this.localStream.removeTrack(oldVideoTrack);
            oldVideoTrack.stop();
          }
          this.localStream.addTrack(videoTrack);
        }

        toggleScreenSharing();
        this.broadcastDataMessage({ type: 'screen-share-started' });
        this.emitEvent('screen-share-started', { participantId: this.peer?.id });
        return true;
      } else {
        return await this.stopScreenShare();
      }
    } catch (error) {
      console.error('Screen share toggle error:', error);
      this.emitEvent('error', { error: 'Failed to toggle screen sharing' });
      return false;
    }
  }

  private async stopScreenShare(): Promise<boolean> {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: this.getVideoConstraints(),
        audio: this.getAudioConstraints()
      });
      const cameraTrack = cameraStream.getVideoTracks()[0];

      for (const [, call] of this.calls) {
        const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(cameraTrack);
      }

      if (this.localStream) {
        const screenTrack = this.localStream.getVideoTracks()[0];
        if (screenTrack) {
          this.localStream.removeTrack(screenTrack);
          screenTrack.stop();
        }
        this.localStream.addTrack(cameraTrack);
      }

      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }

      const { toggleScreenSharing } = useMeetingStore.getState();
      toggleScreenSharing();
      this.broadcastDataMessage({ type: 'screen-share-ended' });
      this.emitEvent('screen-share-ended', { participantId: this.peer?.id });

      return true;
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      this.emitEvent('error', { error: 'Failed to stop screen sharing' });
      return false;
    }
  }

  private broadcastDataMessage(data: any): void {
    if (!this.peer) return;

    for (const [, conn] of this.dataConnections) {
      conn.send(data);
    }
  }

  cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
    }

    for (const [, call] of this.calls) {
      call.close();
    }
    this.calls.clear();

    for (const [, conn] of this.dataConnections) {
      conn.close();
    }
    this.dataConnections.clear();

    if (this.peer) {
      this.peer.destroy();
    }
  }
}