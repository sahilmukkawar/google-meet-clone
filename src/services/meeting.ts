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
  
  // Initialize PeerJS
  const peer = new Peer(undefined, {
    host: import.meta.env.VITE_PEER_HOST || 'localhost',
    port: Number(import.meta.env.VITE_PEER_PORT) || 9000,
    path: '/videochat',
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
        // In a real implementation, we would handle the stream
        // and add the participant to the store
        console.log('Received remote stream', remoteStream);
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
        // In a real implementation, we would handle the stream
        console.log('Received remote stream', remoteStream);
      });
    });
    
    return stream;
  });
};

export const leaveCall = (peer: Peer) => {
  peer.disconnect();
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