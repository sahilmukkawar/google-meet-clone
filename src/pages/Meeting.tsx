import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { MeetingService } from '../services/meeting';
import { api } from '../services/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MonitorUp, MessageCircle, PhoneOff, X,
  AlertCircle, Loader2
} from 'lucide-react';

export default function Meeting() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const { setError, clearError } = useMeetingStore();
  const [isLoading, setIsLoading] = useState(true);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ sender: string; text: string }>>([]);
  const meetingServiceRef = useRef<MeetingService | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkAuth = async () => {
      if (!isAuthenticated) {
        setShowAccessDenied(true);
        setError('Please log in to join the meeting');
        return;
      }

      try {
        const response = await api.getMeeting(id || '');
        if (!response.success) {
          setShowAccessDenied(true);
          setError(response.error || 'Failed to fetch meeting details');
          return;
        }

        const meeting = response.data;
        if (meeting?.isPrivate && meeting?.createdBy !== user?.id) {
          setShowAccessDenied(true);
          setError('You do not have access to this meeting');
          return;
        }

        // Initialize meeting service
        meetingServiceRef.current = new MeetingService();
        meetingServiceRef.current.setOnParticipantsUpdate(setParticipants);
        meetingServiceRef.current.setOnError((error) => {
          setError(error);
          // Show error toast
          const toast = document.createElement('div');
          toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md';
          toast.textContent = error;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 5000);
        });

        await meetingServiceRef.current.initializeMeeting(id || '', user?.id || '');
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing meeting:', error);
        setShowAccessDenied(true);
        setError('Failed to join meeting. Please try again.');
      }
    };

    checkAuth();

    return () => {
      meetingServiceRef.current?.leaveMeeting();
    };
  }, [id, user, isAuthenticated]);

  const handleToggleAudio = async () => {
    if (!meetingServiceRef.current) return;
    await meetingServiceRef.current.toggleAudio(!isAudioEnabled);
    setIsAudioEnabled(!isAudioEnabled);
  };

  const handleToggleVideo = async () => {
    if (!meetingServiceRef.current) return;
    await meetingServiceRef.current.toggleVideo(!isVideoEnabled);
    setIsVideoEnabled(!isVideoEnabled);
  };

  const handleToggleScreenShare = async () => {
    if (!meetingServiceRef.current) return;
    await meetingServiceRef.current.toggleScreenShare(!isScreenSharing);
    setIsScreenSharing(!isScreenSharing);
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;
    setMessages([...messages, { sender: user?.name || 'You', text: message }]);
    setMessage('');
  };

  const handleLeaveMeeting = () => {
    meetingServiceRef.current?.leaveMeeting();
    navigate('/dashboard');
  };

  if (showAccessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-center mb-4">Access Denied</h1>
          <p className="text-center text-gray-600 mb-6">
            {useMeetingStore.getState().error || 'You do not have access to this meeting'}
          </p>
          <div className="flex justify-center gap-4">
            <Button onClick={() => navigate('/login')}>Login</Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Main content */}
      <div className="flex-1 flex">
        {/* Video grid */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-2 gap-4 h-full">
            {/* Local video */}
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <span className="text-white">{user?.name} (You)</span>
              </div>
            </div>

            {/* Remote videos */}
            <div ref={remoteVideosRef} className="grid grid-cols-2 gap-4">
              {participants.map((participant) => (
                <div key={participant.id} className="relative bg-black rounded-lg overflow-hidden">
                  <video
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-4 left-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white">
                      {participant.name?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-white">{participant.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat sidebar */}
        {isChatOpen && (
          <div className="w-80 border-l bg-white p-4 flex flex-col">
            <div className="flex-1 overflow-y-auto mb-4">
              {messages.map((msg, index) => (
                <div key={index} className="mb-2">
                  <span className="font-semibold">{msg.sender}: </span>
                  <span>{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <Button onClick={handleSendMessage}>Send</Button>
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="bg-white border-t p-4">
        <div className="flex justify-center items-center gap-4">
          <Button
            variant={isAudioEnabled ? 'primary' : 'danger'}
            onClick={handleToggleAudio}
          >
            {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Button>
          <Button
            variant={isVideoEnabled ? 'primary' : 'danger'}
            onClick={handleToggleVideo}
          >
            {isVideoEnabled ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Button>
          <Button
            variant={isScreenSharing ? 'primary' : 'outline'}
            onClick={handleToggleScreenShare}
          >
            <MonitorUp className="h-5 w-5" />
          </Button>
          <Button
            variant={isChatOpen ? 'primary' : 'outline'}
            onClick={() => setIsChatOpen(!isChatOpen)}
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
          <Button variant="danger" onClick={handleLeaveMeeting}>
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}