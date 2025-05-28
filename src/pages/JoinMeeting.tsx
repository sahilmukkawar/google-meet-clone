import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Video } from 'lucide-react';

const JoinMeeting = () => {
  const [meetingId, setMeetingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
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
    
    navigate(`/meeting/${formattedId}`);
  };

  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <Video className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold">Join a Meeting</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded-md mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Meeting ID"
            placeholder="Enter meeting ID"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
          />

          <Button type="submit" className="w-full">
            Join Now
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-lg font-semibold mb-4">Don't have a meeting ID?</h2>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/create')}
          >
            Create a New Meeting
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinMeeting;