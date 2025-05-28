import Peer from 'peerjs';
import { useMeetingStore } from '../stores/meetingStore';
import { useAuthStore } from '../stores/authStore';

export const initializeMeeting = (meetingId: string) => {
  const { user } = useAuthStore.getState();
  const { 
    setMeetingId, 
    addParticipant, 
    removeParticipant,
    updateParticipant
  } = useMeetingStore.getState();
  
  if (!user) return null;
  
  // Generate a random ID for the peer
  const peerId = Math.random().toString(36).substring(2, 15);
  
  // Initialize PeerJS
  const peer = new Peer(peerId, {
    host: import.meta.env.VITE_PEER_HOST || 'localhost',
    port: Number(import.meta.env.VITE_PEER_PORT) || 9000,
    path: '/videochat',
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });
  
  // Set meeting ID in store
  setMeetingId(meetingId);
  
  // Add local participant
  addParticipant({
    id: peer.id,
    name: user.name,
    isAudioEnabled: true,
    isVideoEnabled: true,
  });
  
  // Handle incoming calls
  peer.on('call', (call) => {
    const { isAudioEnabled, isVideoEnabled } = useMeetingStore.getState();
    
    // Get local stream
    navigator.mediaDevices.getUserMedia({
      video: isVideoEnabled,
      audio: isAudioEnabled,
    }).then((stream) => {
      // Answer call with our stream
      call.answer(stream);
      
      // Add remote participant when stream received
      call.on('stream', (remoteStream) => {
        const remoteParticipant = {
          id: call.peer,
          name: 'Remote User', // In a real app, you'd get this from a signaling server
          stream: remoteStream,
          isAudioEnabled: true,
          isVideoEnabled: true,
        };
        
        addParticipant(remoteParticipant);
      });
      
      // Handle call close
      call.on('close', () => {
        removeParticipant(call.peer);
      });
    }).catch(err => {
      console.error('Failed to get local stream', err);
    });
  });
  
  // Handle disconnection
  peer.on('close', () => {
    setMeetingId(null);
  });
  
  peer.on('error', (err) => {
    console.error('PeerJS error:', err);
  });
  
  return peer;
};

export const joinMeeting = (peer: Peer, participantIds: string[]) => {
  const { isAudioEnabled, isVideoEnabled } = useMeetingStore.getState();
  
  // Get local stream
  return navigator.mediaDevices.getUserMedia({
    video: isVideoEnabled,
    audio: isAudioEnabled,
  }).then((stream) => {
    // Call each participant
    participantIds.forEach(participantId => {
      const call = peer.call(participantId, stream);
      
      // Handle stream from the remote participant
      call.on('stream', (remoteStream) => {
        const remoteParticipant = {
          id: participantId,
          name: 'Remote User', // In a real app, you'd get this from a signaling server
          stream: remoteStream,
          isAudioEnabled: true,
          isVideoEnabled: true,
        };
        
        useMeetingStore.getState().addParticipant(remoteParticipant);
      });
      
      // Handle call close
      call.on('close', () => {
        useMeetingStore.getState().removeParticipant(participantId);
      });
    });
    
    return stream;
  });
};

export const leaveCall = (peer: Peer) => {
  if (!peer) return;
  
  // Close all connections
  peer.destroy();
};

export const toggleAudio = (stream: MediaStream | null) => {
  if (!stream) return;
  
  const { toggleAudio, isAudioEnabled } = useMeetingStore.getState();
  toggleAudio();
  
  stream.getAudioTracks().forEach(track => {
    track.enabled = !isAudioEnabled;
  });
};

export const toggleVideo = (stream: MediaStream | null) => {
  if (!stream) return;
  
  const { toggleVideo, isVideoEnabled } = useMeetingStore.getState();
  toggleVideo();
  
  stream.getVideoTracks().forEach(track => {
    track.enabled = !isVideoEnabled;
  });
};