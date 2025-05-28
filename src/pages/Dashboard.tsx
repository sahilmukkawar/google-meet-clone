import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import Button from '../components/ui/Button';
import { Plus, Calendar, Video, Clock, Lock } from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  createdBy: string;
  scheduledFor?: string;
  createdAt: string;
  isPrivate: boolean;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchMeetings = async () => {
      setIsLoading(true);
      try {
        const response = await api.getMeetings();
        
        if (response.error) {
          setError(response.error);
          return;
        }
        
        if (response.data) {
          setMeetings(response.data);
        }
      } catch (err) {
        setError('Failed to load meetings');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeetings();
  }, [user, navigate]);

  const formatMeetingDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'EEEE, MMMM d, yyyy h:mm a');
    } catch (err) {
      return 'Date not set';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">My Meetings</h1>
        <Link to="/create">
          <Button leftIcon={<Plus className="w-4 h-4" />}>
            New Meeting
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-800 p-4 rounded-md">
          {error}
        </div>
      ) : meetings.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No meetings scheduled</h2>
          <p className="text-gray-600 mb-6">
            Create your first meeting to get started.
          </p>
          <Link to="/create">
            <Button>Create Meeting</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Upcoming Meetings</h2>
          </div>
          
          <ul className="divide-y divide-gray-200">
            {meetings.map((meeting) => (
              <li key={meeting.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{meeting.title}</h3>
                      {meeting.isPrivate && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Private
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 flex items-center mt-1">
                      <Clock className="w-4 h-4 mr-1" />
                      {meeting.scheduledFor ? formatMeetingDate(meeting.scheduledFor) : 'No date set'}
                    </p>
                  </div>
                  
                  <Link to={`/meeting/${meeting.id}`}>
                    <Button 
                      variant="outline" 
                      leftIcon={<Video className="w-4 h-4" />}
                    >
                      Join
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Dashboard;