import Peer from 'peerjs';
import { useMeetingStore } from '../stores/meetingStore';
import { useAuthStore } from '../stores/authStore';

export interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isHost?: boolean;
}

export class MeetingService {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private calls: Map<string, any> = new Map();
  private meetingId: string | null = null;
  private isInitialized = false;

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
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
          ],
        },
      });

      await this.setupPeerEventHandlers();
      await this.getLocalStream();

      const { setMeetingId, addParticipant } = useMeetingStore.getState();
      setMeetingId(meetingId);

      addParticipant({
        id: peerId,
        name: user.name,
        stream: this.localStream || undefined,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isHost: true,
      });

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize meeting:', error);
      return false;
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
        resolve();
      });

      this.peer.on('call', this.handleIncomingCall);
      this.peer.on('connection', this.handlePeerConnection);

      this.peer.on('error', (error) => {
        console.error('Peer error:', error);
        if (!this.isInitialized) reject(error);
      });

      this.peer.on('disconnected', () => {
        console.log('Peer disconnected');
        this.reconnectPeer();
      });

      this.peer.on('close', () => {
        console.log('Peer connection closed');
      });

      setTimeout(() => {
        if (!this.isInitialized) {
          reject(new Error('Peer connection timeout'));
        }
      }, 10000);
    });
  }

  private reconnectPeer(): void {
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.reconnect();
      } catch (error) {
        console.error('Failed to reconnect peer:', error);
      }
    }
  }

  private async getLocalStream(): Promise<void> {
    try {
      const constraints = {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.error('Failed to access media devices:', error);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (fallbackError) {
        console.error('Fallback media access failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  private handleIncomingCall(call: any): void {
    console.log('Incoming call from:', call.peer);
    if (!this.localStream) return;

    call.answer(this.localStream);
    this.calls.set(call.peer, call);

    call.on('stream', (remoteStream: MediaStream) => {
      console.log('Received remote stream:', call.peer);
      this.addRemoteParticipant(call.peer, remoteStream);
    });

    call.on('close', () => {
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
      }
    });

    conn.on('close', () => {
      console.log('Data connection closed:', conn.peer);
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

    return !isEnabled;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    const isEnabled = videoTracks[0]?.enabled ?? true;

    videoTracks.forEach(track => (track.enabled = !isEnabled));
    const { toggleVideo } = useMeetingStore.getState();
    toggleVideo();

    return !isEnabled;
  }

  async toggleScreenShare(): Promise<boolean> {
    try {
      const { isScreenSharing, toggleScreenSharing } = useMeetingStore.getState();

      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const videoTrack = screenStream.getVideoTracks()[0];

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
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const cameraTrack = cameraStream.getVideoTracks()[0];

      for (const [, call] of this.calls) {
        const sender = call.peerConnection.getSenders().find((s: any) => s.track?.kind === 'video');
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
      return false;
    }
  }
}
