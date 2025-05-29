import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Video, Link as LinkIcon, Copy, AlertCircle } from 'lucide-react';

const JoinMeeting = () => {
  const [meetingId, setMeetingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!meetingId) {
      setError('Please enter a meeting ID');
      return;
    }
    
    // Remove any whitespace
    const formattedId = meetingId.trim();
    
    // Simple validation for meeting ID format
    if (formattedId.length < 6) {
      setError('Invalid meeting ID format');
      return;
    }

    setIsLoading(true);
    try {
      // Check if meeting exists and is accessible
      const response = await fetch(`${import.meta.env.VITE_API_URL}/meetings/${formattedId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError('Meeting not found');
        } else if (response.status === 403) {
          setError('You do not have access to this meeting');
        } else {
          setError('Failed to join meeting. Please try again.');
        }
        return;
      }

      navigate(`/meeting/${formattedId}`);
    } catch (err) {
      setError('Failed to join meeting. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Extract meeting ID from URL if it's a full URL
      const match = text.match(/\/meeting\/([^\/\s]+)/);
      const id = match ? match[1] : text.trim();
      setMeetingId(id);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-md mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6">
            <div className="flex items-center gap-3 mb-2">
              <Video className="w-8 h-8" />
              <h1 className="text-2xl font-bold">Join a Meeting</h1>
            </div>
            <p className="text-blue-100">Enter the meeting ID or paste the meeting link</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-800 p-4 border-b border-red-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <Input
                label="Meeting ID or Link"
                placeholder="Enter meeting ID or paste meeting link"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                className="pr-24"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handlePaste}
                leftIcon={<Copy className="h-4 w-4" />}
              >
                Paste from Clipboard
              </Button>
            </div>

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                isLoading={isLoading}
                leftIcon={<Video className="h-4 w-4" />}
              >
                Join Now
              </Button>
            </div>
          </form>

          <div className="p-6 bg-gray-50 border-t border-gray-200">
            <h2 className="text-lg font-semibold mb-4">Don't have a meeting ID?</h2>
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/create')}
                leftIcon={<Video className="h-4 w-4" />}
              >
                Create a New Meeting
              </Button>
              <p className="text-sm text-gray-600 text-center">
                Or go back to{' '}
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  your meetings
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinMeeting;