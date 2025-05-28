import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../stores/meetingStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';
import { MeetingService } from '../services/meeting';
import Button from '../components/ui/Button';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MonitorUp, MessageCircle, UserPlus, X, Phone,
  AlertCircle
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
    error,
    toggleAudio: toggleAudioState,
    toggleVideo: toggleVideoState,
    toggleScreenSharing: toggleScreenSharingState,
    toggleChat,
    addMessage,
    setError,
    clearError
  } = useMeetingStore();
  
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const meetingServiceRef = useRef<MeetingService | null>(null);
  
  // Check authentication and meeting access
  useEffect(() => {
    const checkAuth = async () => {
      if (!user) {
        setShowAccessDenied(true);
        setError('Please log in to join the meeting');
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.getMeeting(id || '');
        
        if (response.error) {
          setError(response.error);
          setShowAccessDenied(true);
          return;
        }
        
        if (response.data) {
          // Check if user has access to the meeting
          if (response.data.isPrivate && response.data.createdBy !== user.id) {
            setError('You do not have access to this meeting');
            setShowAccessDenied(true);
            return;
          }
          
          setMeeting(response.data);
        }
      } catch (err) {
        console.error('Error checking meeting access:', err);
        setError('Failed to verify meeting access');
        setShowAccessDenied(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [id, user, setError]);
  
  // Initialize WebRTC when meeting data is loaded
  useEffect(() => {
    if (!meeting || !user) return;
    
    const setupMeeting = async () => {
      try {
        // Initialize meeting service
        meetingServiceRef.current = new MeetingService();
        const success = await meetingServiceRef.current.initializeMeeting(meeting.id);
        
        if (!success) {
          setError('Failed to initialize meeting connection');
          return;
        }
        
        // Get local stream
        const stream = await navigator.mediaDevices.getUserMedia({
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
          },
        });
        
        setLocalStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
      } catch (err) {
        console.error('Error accessing media devices:', err);
        setError('Could not access camera or microphone. Please check your permissions.');
      }
    };
    
    setupMeeting();
    
    // Cleanup function
    return () => {
      if (meetingServiceRef.current) {
        meetingServiceRef.current.cleanup();
      }
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [meeting, user, setError]);
  
  const handleToggleAudio = async () => {
    try {
      if (!meetingServiceRef.current) return;
      
      const success = meetingServiceRef.current.toggleAudio();
      if (!success) {
        setError('Failed to toggle audio');
        return;
      }
      
      toggleAudioState();
    } catch (err) {
      console.error('Error toggling audio:', err);
      setError('Failed to toggle audio');
    }
  };
  
  const handleToggleVideo = async () => {
    try {
      if (!meetingServiceRef.current) return;
      
      const success = meetingServiceRef.current.toggleVideo();
      if (!success) {
        setError('Failed to toggle video');
        return;
      }
      
      toggleVideoState();
    } catch (err) {
      console.error('Error toggling video:', err);
      setError('Failed to toggle video');
    }
  };
  
  const handleToggleScreenSharing = async () => {
    try {
      if (!meetingServiceRef.current) return;
      
      const success = await meetingServiceRef.current.toggleScreenShare();
      if (!success) {
        setError('Failed to toggle screen sharing');
        return;
      }
      
      toggleScreenSharingState();
    } catch (err) {
      console.error('Error sharing screen:', err);
      setError('Failed to share screen');
    }
  };
  
  const handleLeaveCall = () => {
    if (meetingServiceRef.current) {
      meetingServiceRef.current.cleanup();
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
      
      {/* Error notification */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-md flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button 
            className="ml-2 hover:text-gray-200"
            onClick={() => clearError()}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {/* Control bar */}
      <div className="bg-gray-800 px-4 py-3 flex justify-center items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          className={`rounded-full ${!isAudioEnabled ? 'bg-red-500 text-white' : 'text-white'}`}
          onClick={handleToggleAudio}
        >
          {!isAudioEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className={`rounded-full ${!isVideoEnabled ? 'bg-red-500 text-white' : 'text-white'}`}
          onClick={handleToggleVideo}
        >
          {!isVideoEnabled ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
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