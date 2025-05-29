import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow } from 'date-fns';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import Button from '../components/ui/Button';
import { Plus, Calendar, Video, Clock, Lock, Copy, Share2, MoreVertical, Search } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');

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
      if (isToday(date)) {
        return `Today at ${format(date, 'h:mm a')}`;
      }
      if (isTomorrow(date)) {
        return `Tomorrow at ${format(date, 'h:mm a')}`;
      }
      return format(date, 'EEEE, MMMM d, yyyy h:mm a');
    } catch (err) {
      return 'Date not set';
    }
  };

  const copyMeetingLink = (meetingId: string) => {
    const link = `${window.location.origin}/meeting/${meetingId}`;
    navigator.clipboard.writeText(link);
    // You could add a toast notification here
  };

  const filteredMeetings = meetings.filter(meeting =>
    meeting.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
            <p className="text-gray-600 mt-1">Here's what's happening with your meetings</p>
          </div>
          <div className="flex gap-4 w-full sm:w-auto">
            <Link to="/create" className="flex-1 sm:flex-none">
              <Button 
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
                leftIcon={<Plus className="w-4 h-4" />}
              >
                New Meeting
              </Button>
            </Link>
            <Link to="/join" className="flex-1 sm:flex-none">
              <Button 
                variant="outline"
                className="w-full sm:w-auto"
                leftIcon={<Video className="w-4 h-4" />}
              >
                Join Meeting
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search meetings..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-200">
            {error}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-sm text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No meetings found</h2>
            <p className="text-gray-600 mb-6">
              {searchQuery ? 'No meetings match your search.' : 'Create your first meeting to get started.'}
            </p>
            <Link to="/create">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                Create Meeting
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Meetings</h2>
            </div>
            
            <ul className="divide-y divide-gray-200">
              {filteredMeetings.map((meeting) => (
                <li key={meeting.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg text-gray-900">{meeting.title}</h3>
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
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyMeetingLink(meeting.id)}
                        leftIcon={<Copy className="w-4 h-4" />}
                      >
                        Copy Link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Share2 className="w-4 h-4" />}
                      >
                        Share
                      </Button>
                      <Link to={`/meeting/${meeting.id}`}>
                        <Button 
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          leftIcon={<Video className="w-4 h-4" />}
                        >
                          Join
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<MoreVertical className="w-4 h-4" />}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;