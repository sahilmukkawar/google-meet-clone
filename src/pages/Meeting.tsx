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
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  
  // Fetch meeting data
  useEffect(() => {
    const fetchMeeting = async () => {
      if (!id) return;
      
      try {
        const response = await api.getMeeting(id);
        
        if (response.error) {
          setError(response.error);
          return;
        }
        
        if (response.data) {
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
  }, [id]);
  
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
        setError('Could not access camera or microphone');
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
  
  const handleToggleAudio = () => {
    toggleAudioState();
    toggleAudio(localStream);
  };
  
  const handleToggleVideo = () => {
    toggleVideoState();
    toggleVideo(localStream);
  };
  
  const handleToggleScreenSharing = async () => {
    toggleScreenSharingState();
    
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        
        // Here you would handle replacing the video track
        // with the screen sharing track in the peer connection
        
      } catch (err) {
        console.error('Error sharing screen:', err);
      }
    } else {
      // Revert back to camera
      if (localStream && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
    }
  };
  
  const handleLeaveCall = () => {
    if (peerRef.current) {
      leaveCall(peerRef.current);
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
    // You could show a notification here
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="bg-red-50 text-red-800 p-6 rounded-lg inline-block">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p>{error}</p>
          <Button className="mt-4" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
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
              {messages.map(message => (
                <div key={message.id} className="text-white">
                  <p className="text-sm text-gray-400">{message.sender}</p>
                  <p className="bg-gray-700 p-2 rounded-md mt-1">{message.content}</p>
                </div>
              ))}
            </div>
            
            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-700">
              <div className="flex">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-700 text-white rounded-l-md px-3 py-2 focus:outline-none"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-3 py-2 rounded-r-md hover:bg-blue-700"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      
      {/* Meeting controls */}
      <div className="bg-gray-800 text-white px-4 py-3 flex justify-center items-center gap-4">
        <Button
          variant="ghost"
          className={`rounded-full p-3 ${isAudioEnabled ? 'text-white hover:bg-gray-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
          onClick={handleToggleAudio}
        >
          {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </Button>
        
        <Button
          variant="ghost"
          className={`rounded-full p-3 ${isVideoEnabled ? 'text-white hover:bg-gray-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
          onClick={handleToggleVideo}
        >
          {isVideoEnabled ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </Button>
        
        <Button
          variant="ghost"
          className={`rounded-full p-3 ${isScreenSharing ? 'bg-green-600 text-white hover:bg-green-700' : 'text-white hover:bg-gray-700'}`}
          onClick={handleToggleScreenSharing}
        >
          <MonitorUp className="w-5 h-5" />
        </Button>
        
        <Button
          variant="ghost"
          className={`rounded-full p-3 ${isChatOpen ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-white hover:bg-gray-700'}`}
          onClick={toggleChat}
        >
          <MessageCircle className="w-5 h-5" />
        </Button>
        
        <Button
          variant="ghost"
          className="rounded-full p-3 bg-red-600 text-white hover:bg-red-700"
          onClick={handleLeaveCall}
        >
          <Phone className="w-5 h-5 transform rotate-135" />
        </Button>
      </div>
    </div>
  );
};

export default Meeting;