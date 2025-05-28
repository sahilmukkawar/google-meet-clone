import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../stores/meetingStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';
import { initializeMeeting, leaveCall, toggleAudio, toggleVideo } from '../services/meeting';
import Button from '../components/ui/Button';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MonitorUp, MessageCircle, UserPlus, X, Phone
} from 'lucide-react';

interface MeetingData {
  id: string;
  title: string;
  createdBy: string;
  isPrivate: boolean;
}

const Meeting = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { 
    isAudioEnabled, 
    isVideoEnabled, 
    isScreenSharing,
    isChatOpen,
    messages,
    toggleAudio: toggleAudioState,
    toggleVideo: toggleVideoState,
    toggleScreenSharing: toggleScreenSharingState,
    toggleChat,
    addMessage
  } = useMeetingStore();
  
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  
  // Check authentication and meeting access
  useEffect(() => {
    if (!user) {
      setShowAccessDenied(true);
      setError('Please log in to join the meeting');
      setIsLoading(false);
      return;
    }
  }, [user]);
  
  // Fetch meeting data
  useEffect(() => {
    const fetchMeeting = async () => {
      if (!id || !user) return;
      
      try {
        const response = await api.getMeeting(id);
        
        if (response.error) {
          setError(response.error);
          return;
        }
        
        if (response.data) {
          // Check if user has access to the meeting
          if (response.data.isPrivate && response.data.createdBy !== user.id) {
            setError('You do not have access to this meeting');
            return;
          }
          
          setMeeting(response.data);
        }
      } catch (err) {
        setError('Failed to load meeting data');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMeeting();
  }, [id, user]);
  
  // Initialize WebRTC when meeting data is loaded
  useEffect(() => {
    if (!meeting || !user) return;
    
    const setupMeeting = async () => {
      try {
        // Get local media stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        
        // Set local stream
        setLocalStream(stream);
        
        // Set local video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        // Initialize peer connection
        peerRef.current = initializeMeeting(meeting.id);
        
      } catch (err) {
        console.error('Error accessing media devices:', err);
        setError('Could not access camera or microphone. Please check your permissions.');
      }
    };
    
    setupMeeting();
    
    // Cleanup function
    return () => {
      if (peerRef.current) {
        leaveCall(peerRef.current);
      }
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [meeting, user]);
  
  const handleToggleAudio = async () => {
    try {
      if (!localStream) {
        throw new Error('No local stream available');
      }
      
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      // Toggle audio state
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      toggleAudioState();
      
      // Enable/disable all audio tracks
      audioTracks.forEach(track => {
        track.enabled = !newMutedState;
      });

      // Update peer connection if it exists
      if (peerRef.current) {
        const senders = peerRef.current.getSenders();
        const audioSender = senders.find(sender => sender.track?.kind === 'audio');
        if (audioSender) {
          audioSender.track.enabled = !newMutedState;
        }
      }
    } catch (err) {
      console.error('Error toggling audio:', err);
      setError('Failed to toggle audio');
      // Revert state on error
      setIsMuted(!isMuted);
      toggleAudioState();
    }
  };
  
  const handleToggleVideo = async () => {
    try {
      if (!localStream) {
        throw new Error('No local stream available');
      }
      
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video tracks available');
      }

      // Toggle video state
      const newVideoState = !isVideoOff;
      setIsVideoOff(newVideoState);
      toggleVideoState();
      
      // Enable/disable all video tracks
      videoTracks.forEach(track => {
        track.enabled = !newVideoState;
      });

      // Update peer connection if it exists
      if (peerRef.current) {
        const senders = peerRef.current.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        if (videoSender) {
          videoSender.track.enabled = !newVideoState;
        }
      }

      // Update video element visibility
      if (localVideoRef.current) {
        localVideoRef.current.style.display = newVideoState ? 'none' : 'block';
      }
    } catch (err) {
      console.error('Error toggling video:', err);
      setError('Failed to toggle video');
      // Revert state on error
      setIsVideoOff(!isVideoOff);
      toggleVideoState();
    }
  };
  
  const handleToggleScreenSharing = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        
        // Handle screen sharing stop
        screenStream.getVideoTracks()[0].onended = () => {
          if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
          }
          toggleScreenSharingState();
        };
      } else {
        if (localStream && localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      }
      
      toggleScreenSharingState();
    } catch (err) {
      console.error('Error sharing screen:', err);
      setError('Failed to share screen');
    }
  };
  
  const handleLeaveCall = () => {
    if (peerRef.current) {
      leaveCall(peerRef.current);
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    navigate('/dashboard');
  };
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!chatMessage.trim() || !user) return;
    
    addMessage(user.name, chatMessage);
    setChatMessage('');
  };
  
  const copyMeetingLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    // Show a notification
    alert('Meeting link copied to clipboard!');
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }
  
  if (error || showAccessDenied) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="bg-red-50 text-red-800 p-6 rounded-lg inline-block">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p>{error || 'You do not have permission to access this meeting'}</p>
          <div className="mt-4 space-x-4">
            <Button onClick={() => navigate('/login')}>
              Login
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Meeting header */}
      <div className="bg-gray-800 text-white px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="font-semibold">{meeting?.title || 'Meeting'}</h1>
          <p className="text-sm text-gray-400">Meeting ID: {id}</p>
          {meeting?.isPrivate && (
            <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full ml-2">
              Private
            </span>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm"
          className="text-white border-gray-600 hover:bg-gray-700"
          leftIcon={<UserPlus className="w-4 h-4" />}
          onClick={copyMeetingLink}
        >
          Invite
        </Button>
      </div>
      
      {/* Meeting content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main video area */}
        <div className="flex-1 bg-black relative">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          
          {/* Participant label */}
          <div className="absolute bottom-4 left-4 bg-gray-800 bg-opacity-75 text-white px-3 py-1 rounded-md">
            {user?.name || 'You'} (You)
          </div>
        </div>
        
        {/* Chat sidebar */}
        {isChatOpen && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-white font-medium">Chat</h2>
              <button 
                className="text-gray-400 hover:text-white"
                onClick={toggleChat}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {messages.map((message, index) => (
                <div key={index} className="text-white">
                  <p className="text-sm text-gray-400">{message.sender}</p>
                  <p className="bg-gray-700 p-2 rounded-md mt-1">{message.content}</p>
                </div>
              ))}
            </div>
            
            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button type="submit" size="sm">
                  Send
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
      
      {/* Control bar */}
      <div className="bg-gray-800 px-4 py-3 flex justify-center items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          className={`rounded-full ${isMuted ? 'bg-red-500 text-white' : 'text-white'}`}
          onClick={handleToggleAudio}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className={`rounded-full ${isVideoOff ? 'bg-red-500 text-white' : 'text-white'}`}
          onClick={handleToggleVideo}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className={`rounded-full ${isScreenSharing ? 'bg-blue-500 text-white' : 'text-white'}`}
          onClick={handleToggleScreenSharing}
        >
          <MonitorUp className="w-5 h-5" />
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-white"
          onClick={toggleChat}
        >
          <MessageCircle className="w-5 h-5" />
        </Button>
        
        <Button
          variant="danger"
          size="sm"
          className="rounded-full"
          onClick={handleLeaveCall}
        >
          <Phone className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
};

export default Meeting;