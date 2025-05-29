import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { MeetingService as MeetingServiceType } from '../services/meeting';
import { api } from '../services/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MonitorUp, MessageCircle, PhoneOff, X,
  AlertCircle, Loader2, Users, Settings, MoreVertical,
  Share2, Captions, Hand, Info, Shield, Clock
} from 'lucide-react';

interface MeetingService {
  initializeMeeting: (meetingId: string, userId: string) => Promise<void>;
  toggleAudio: (enabled: boolean) => Promise<void>;
  toggleVideo: (enabled: boolean) => Promise<void>;
  toggleScreenShare: (enabled: boolean) => Promise<void>;
  leaveMeeting: () => void;
  setOnParticipantsUpdate: (callback: (participants: any[]) => void) => void;
  setOnError: (callback: (error: string) => void) => void;
}

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
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ sender: string; text: string; timestamp: Date }>>([]);
  const [showHand, setShowHand] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const meetingServiceRef = useRef<MeetingService | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
        const meetingService = new MeetingServiceType() as unknown as MeetingService;
        meetingServiceRef.current = meetingService;
        meetingServiceRef.current.setOnParticipantsUpdate(setParticipants);
        meetingServiceRef.current.setOnError((error: string) => {
          setError(error);
          // Show error toast
          const toast = document.createElement('div');
          toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg z-50';
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

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

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
    setMessages([...messages, { 
      sender: user?.name || 'You', 
      text: message,
      timestamp: new Date()
    }]);
    setMessage('');
  };

  const handleLeaveMeeting = () => {
    meetingServiceRef.current?.leaveMeeting();
    navigate('/dashboard');
  };

  const copyMeetingLink = () => {
    const link = `${window.location.origin}/meeting/${id}`;
    navigator.clipboard.writeText(link);
    // Show toast
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50';
    toast.textContent = 'Meeting link copied to clipboard';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  if (showAccessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg">
          <div className="flex justify-center mb-6">
            <Shield className="h-16 w-16 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-4">Access Denied</h1>
          <p className="text-center text-gray-600 mb-8">
            {useMeetingStore.getState().error || 'You do not have access to this meeting'}
          </p>
          <div className="flex flex-col gap-3">
            <Button 
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Login
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/dashboard')}
              className="w-full"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Joining meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-medium">Meeting: {id}</h1>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Clock className="h-4 w-4" />
            <span>00:00</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-gray-700"
            onClick={copyMeetingLink}
            leftIcon={<Share2 className="h-4 w-4" />}
          >
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-gray-700"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            leftIcon={<Settings className="h-4 w-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-gray-700"
            onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
            leftIcon={<Users className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Video grid */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
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
            <div ref={remoteVideosRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Sidebars */}
        {(isChatOpen || isParticipantsOpen || isSettingsOpen) && (
          <div className="w-80 border-l border-gray-700 bg-gray-800 text-white">
            {/* Chat sidebar */}
            {isChatOpen && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-700">
                  <h2 className="text-lg font-medium">Meeting Chat</h2>
                </div>
                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4"
                >
                  {messages.map((msg, index) => (
                    <div key={index} className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-400">{msg.sender}</span>
                        <span className="text-xs text-gray-400">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-gray-200">{msg.text}</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-700">
                  <div className="flex gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="bg-gray-700 text-white border-gray-600"
                    />
                    <Button 
                      onClick={handleSendMessage}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Participants sidebar */}
            {isParticipantsOpen && (
              <div className="h-full">
                <div className="p-4 border-b border-gray-700">
                  <h2 className="text-lg font-medium">Participants ({participants.length + 1})</h2>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                      {user?.name?.[0]?.toUpperCase()}
                    </div>
                    <span>{user?.name} (You)</span>
                  </div>
                  {participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                        {participant.name?.[0]?.toUpperCase()}
                      </div>
                      <span>{participant.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settings sidebar */}
            {isSettingsOpen && (
              <div className="h-full">
                <div className="p-4 border-b border-gray-700">
                  <h2 className="text-lg font-medium">Settings</h2>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Camera</label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white">
                      <option>Default Camera</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Microphone</label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white">
                      <option>Default Microphone</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Speaker</label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white">
                      <option>Default Speaker</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex justify-center items-center gap-4">
          <Button
            variant={isAudioEnabled ? 'primary' : 'danger'}
            onClick={handleToggleAudio}
            className="rounded-full p-3"
          >
            {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Button>
          <Button
            variant={isVideoEnabled ? 'primary' : 'danger'}
            onClick={handleToggleVideo}
            className="rounded-full p-3"
          >
            {isVideoEnabled ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Button>
          <Button
            variant={isScreenSharing ? 'primary' : 'outline'}
            onClick={handleToggleScreenShare}
            className="rounded-full p-3"
          >
            <MonitorUp className="h-5 w-5" />
          </Button>
          <Button
            variant={showCaptions ? 'primary' : 'outline'}
            onClick={() => setShowCaptions(!showCaptions)}
            className="rounded-full p-3"
          >
            <Captions className="h-5 w-5" />
          </Button>
          <Button
            variant={showHand ? 'primary' : 'outline'}
            onClick={() => setShowHand(!showHand)}
            className="rounded-full p-3"
          >
            <Hand className="h-5 w-5" />
          </Button>
          <Button
            variant={isChatOpen ? 'primary' : 'outline'}
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="rounded-full p-3"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
          <Button 
            variant="danger" 
            onClick={handleLeaveMeeting}
            className="rounded-full p-3 bg-red-600 hover:bg-red-700"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}