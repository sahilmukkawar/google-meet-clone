import Peer from 'peerjs';
import { useMeetingStore } from '../stores/meetingStore';
import { useAuthStore } from '../stores/authStore';
import { api } from './api';
import { MediaStream, MediaTrackConstraints } from 'webrtc-adapter';

export interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isHost?: boolean;
}

interface DisplayMediaStreamConstraints {
  video: {
    cursor?: 'always' | 'motion' | 'never';
    displaySurface?: 'monitor' | 'window' | 'browser';
  };
  audio?: boolean;
}

interface MediaTrack {
  kind: string;
  enabled: boolean;
  stop(): void;
}

interface RTCPeerConnection {
  getSenders(): Array<{
    track?: MediaTrack;
    replaceTrack(track: MediaTrack): Promise<void>;
  }>;
}

interface PeerCall {
  peer: string;
  peerConnection: RTCPeerConnection;
  connection?: {
    send(data: any): void;
  };
  close(): void;
}

export class MeetingService {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private calls: Map<string, PeerCall> = new Map();
  private meetingId: string | null = null;
  private isInitialized = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.handleIncomingCall = this.handleIncomingCall.bind(this);
    this.handlePeerConnection = this.handlePeerConnection.bind(this);
  }

  async initializeMeeting(meetingId: string): Promise<boolean> {
    try {
      const { user } = useAuthStore.getState();
      if (!user) throw new Error('User not authenticated');

      this.meetingId = meetingId;
      const peerId = `${user.id}-${Date.now()}`;

      this.peer = new Peer(peerId, {
        host: import.meta.env.VITE_PEER_HOST || 'peerjs.com',
        port: import.meta.env.VITE_PEER_PORT ? Number(import.meta.env.VITE_PEER_PORT) : 443,
        path: '/',
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
        },
        debug: 2,
      });

      await this.setupPeerEventHandlers();
      await this.getLocalStream();

      const { setMeetingId, addParticipant } = useMeetingStore.getState();
      setMeetingId(meetingId);

      if (this.localStream) {
        addParticipant({
          id: peerId,
          name: user.name,
          stream: this.localStream,
          isAudioEnabled: true,
          isVideoEnabled: true,
          isHost: true,
        });
      }

      await this.notifyServerJoin(meetingId, peerId);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize meeting:', error);
      return false;
    }
  }

  private async notifyServerJoin(meetingId: string, peerId: string): Promise<void> {
    try {
      await api.notifyJoin(meetingId, peerId);
    } catch (error) {
      console.error('Failed to notify server about join:', error);
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
      this.peer.on('connection', this.handlePeerConnection);

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
      }, 10000);
    });
  }

  private handlePeerError(error: any): void {
    const { setError } = useMeetingStore.getState();
    
    if (error.type === 'peer-unavailable') {
      setError('Peer is not available. They may have left the meeting.');
    } else if (error.type === 'network') {
      setError('Network error. Please check your connection.');
      this.handleDisconnection();
    } else if (error.type === 'permission-denied') {
      setError('Camera/microphone access denied. Please check your permissions.');
    } else {
      setError('Connection error. Please try rejoining the meeting.');
    }
  }

  private handleDisconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }

      this.reconnectTimeout = setTimeout(() => {
        this.reconnectPeer();
      }, delay);
    } else {
      const { setError } = useMeetingStore.getState();
      setError('Connection lost. Please refresh the page to rejoin.');
    }
  }

  private reconnectPeer(): void {
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.reconnect();
      } catch (error) {
        console.error('Failed to reconnect peer:', error);
        this.handleDisconnection();
      }
    }
  }

  private async getLocalStream(): Promise<void> {
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
        },
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
        throw fallbackError;
      }
    }
  }

  private handleIncomingCall(call: any): void {
    console.log('Incoming call from:', call.peer);
    if (!this.localStream) {
      console.error('No local stream available');
      return;
    }

    call.answer(this.localStream);
    this.calls.set(call.peer, call);

    call.on('stream', (remoteStream: MediaStream) => {
      console.log('Received remote stream:', call.peer);
      this.addRemoteParticipant(call.peer, remoteStream);
    });

    call.on('close', () => {
      console.log('Call closed:', call.peer);
      this.removeParticipant(call.peer);
      this.calls.delete(call.peer);
    });

    call.on('error', (error: any) => {
      console.error('Call error:', error);
      this.removeParticipant(call.peer);
      this.calls.delete(call.peer);
    });
  }

  private handlePeerConnection(conn: any): void {
    console.log('Data connection from:', conn.peer);
    
    conn.on('data', (data: any) => {
      if (data.type === 'chat') {
        const { addMessage } = useMeetingStore.getState();
        addMessage(data.sender, data.message);
      } else if (data.type === 'participant-update') {
        const { updateParticipant } = useMeetingStore.getState();
        updateParticipant(data.participantId, data.updates);
      }
    });

    conn.on('close', () => {
      console.log('Data connection closed:', conn.peer);
    });

    conn.on('error', (error: any) => {
      console.error('Data connection error:', error);
    });
  }

  private addRemoteParticipant(peerId: string, stream: MediaStream): void {
    const { addParticipant } = useMeetingStore.getState();
    addParticipant({
      id: peerId,
      name: `User ${peerId.slice(0, 8)}`,
      stream,
      isAudioEnabled: true,
      isVideoEnabled: true,
      isHost: false,
    });
  }

  private removeParticipant(peerId: string): void {
    const { removeParticipant } = useMeetingStore.getState();
    removeParticipant(peerId);
  }

  async callPeer(peerId: string): Promise<boolean> {
    try {
      if (!this.peer || !this.localStream) throw new Error('Peer or stream missing');

      const call = this.peer.call(peerId, this.localStream);
      if (!call) throw new Error('Call could not be established');

      this.calls.set(peerId, call);

      call.on('stream', (remoteStream: MediaStream) => {
        this.addRemoteParticipant(peerId, remoteStream);
      });

      call.on('close', () => {
        this.removeParticipant(peerId);
        this.calls.delete(peerId);
      });

      call.on('error', (error: any) => {
        console.error('Call error:', error);
        this.removeParticipant(peerId);
        this.calls.delete(peerId);
      });

      return true;
    } catch (error) {
      console.error('Error calling peer:', error);
      return false;
    }
  }

  toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    const isEnabled = audioTracks[0]?.enabled ?? true;

    audioTracks.forEach(track => (track.enabled = !isEnabled));
    const { toggleAudio } = useMeetingStore.getState();
    toggleAudio();

    this.notifyParticipantUpdate({ isAudioEnabled: !isEnabled });

    return !isEnabled;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    const isEnabled = videoTracks[0]?.enabled ?? true;

    videoTracks.forEach(track => (track.enabled = !isEnabled));
    const { toggleVideo } = useMeetingStore.getState();
    toggleVideo();

    this.notifyParticipantUpdate({ isVideoEnabled: !isEnabled });

    return !isEnabled;
  }

  private notifyParticipantUpdate(updates: Partial<Participant>): void {
    if (!this.peer) return;

    const data = {
      type: 'participant-update',
      participantId: this.peer.id,
      updates,
    };

    for (const [, call] of this.calls) {
      if (call.connection) {
        call.connection.send(data);
      }
    }
  }

  async toggleScreenShare(): Promise<boolean> {
    try {
      const { isScreenSharing, toggleScreenSharing } = useMeetingStore.getState();

      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor',
          } as MediaTrackConstraints,
          audio: true,
        });

        const videoTrack = screenStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track in screen stream');

        for (const [, call] of this.calls) {
          const sender = call.peerConnection.getSenders().find((s: any) => s.track?.kind === 'video');
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
        return true;
      } else {
        return await this.stopScreenShare();
      }
    } catch (error) {
      console.error('Screen share toggle error:', error);
      return false;
    }
  }

  private async stopScreenShare(): Promise<boolean> {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
      });
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error('No camera track available');

      for (const [, call] of this.calls) {
        const sender = call.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
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

      const { toggleScreenSharing } = useMeetingStore.getState();
      toggleScreenSharing();

      return true;
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      const { setError } = useMeetingStore.getState();
      setError('Failed to stop screen sharing. Please try again.');
      return false;
    }
  }

  cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: MediaTrack) => track.stop());
    }

    for (const [, call] of this.calls) {
      call.close();
    }
    this.calls.clear();

    if (this.peer) {
      this.peer.destroy();
    }
  }
}
