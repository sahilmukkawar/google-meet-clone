import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../services/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Calendar, Video, Clock, Lock, Users, Link as LinkIcon, Copy } from 'lucide-react';

const createMeetingSchema = z.object({
  title: z.string().min(1, 'Meeting title is required'),
  date: z.string().optional(),
  time: z.string().optional(),
  isPrivate: z.boolean().default(false),
  maxParticipants: z.number().min(2).max(100).default(50),
});

type CreateMeetingFormData = z.infer<typeof createMeetingSchema>;

const CreateMeeting = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [meetingLink, setMeetingLink] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreateMeetingFormData>({
    resolver: zodResolver(createMeetingSchema),
    defaultValues: {
      isPrivate: false,
      maxParticipants: 50,
    },
  });

  const isPrivate = watch('isPrivate');

  const onSubmit = async (data: CreateMeetingFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      let scheduledFor: Date | undefined;
      
      if (data.date && data.time) {
        const dateTime = new Date(`${data.date}T${data.time}`);
        if (!isNaN(dateTime.getTime())) {
          scheduledFor = dateTime;
        }
      }

      const response = await api.createMeeting(data.title, scheduledFor, {
        isPrivate: data.isPrivate,
        maxParticipants: data.maxParticipants,
      });

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        const link = `${window.location.origin}/meeting/${response.data.id}`;
        setMeetingLink(link);
        // Don't navigate immediately, show the link first
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyMeetingLink = () => {
    if (meetingLink) {
      navigator.clipboard.writeText(meetingLink);
      // Show toast
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50';
      toast.textContent = 'Meeting link copied to clipboard';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
  };

  const startMeeting = () => {
    if (meetingLink) {
      navigate(meetingLink.replace(window.location.origin, ''));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6">
            <div className="flex items-center gap-3 mb-2">
              <Video className="w-8 h-8" />
              <h1 className="text-2xl font-bold">Create a Meeting</h1>
            </div>
            <p className="text-blue-100">Schedule a new meeting or start one instantly</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-800 p-4 border-b border-red-200">
              {error}
            </div>
          )}

          {meetingLink ? (
            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h2 className="text-lg font-semibold mb-4">Meeting Created Successfully!</h2>
                <div className="flex items-center gap-2 mb-4">
                  <Input
                    value={meetingLink}
                    readOnly
                    className="flex-1 bg-white"
                  />
                  <Button
                    variant="outline"
                    onClick={copyMeetingLink}
                    leftIcon={<Copy className="h-4 w-4" />}
                  >
                    Copy
                  </Button>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={startMeeting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    leftIcon={<Video className="h-4 w-4" />}
                  >
                    Start Meeting
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/dashboard')}
                    className="flex-1"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              <div className="space-y-4">
                <Input
                  label="Meeting Title"
                  placeholder="Weekly Team Sync"
                  error={errors.title?.message}
                  {...register('title')}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Date (Optional)"
                    type="date"
                    error={errors.date?.message}
                    {...register('date')}
                  />

                  <Input
                    label="Time (Optional)"
                    type="time"
                    error={errors.time?.message}
                    {...register('time')}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isPrivate"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      {...register('isPrivate')}
                    />
                    <label htmlFor="isPrivate" className="flex items-center gap-2 text-gray-700">
                      <Lock className="h-4 w-4" />
                      Make this a private meeting
                    </label>
                  </div>

                  {isPrivate && (
                    <div className="pl-6">
                      <Input
                        label="Maximum Participants"
                        type="number"
                        min={2}
                        max={100}
                        error={errors.maxParticipants?.message}
                        {...register('maxParticipants', { valueAsNumber: true })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <Button 
                  type="submit" 
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  isLoading={isLoading}
                  leftIcon={<Video className="h-4 w-4" />}
                >
                  Create Meeting
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateMeeting;