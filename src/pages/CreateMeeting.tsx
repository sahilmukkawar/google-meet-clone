import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../services/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Calendar } from 'lucide-react';

const createMeetingSchema = z.object({
  title: z.string().min(1, 'Meeting title is required'),
  date: z.string().optional(),
  time: z.string().optional(),
});

type CreateMeetingFormData = z.infer<typeof createMeetingSchema>;

const CreateMeeting = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateMeetingFormData>({
    resolver: zodResolver(createMeetingSchema),
  });

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

      const response = await api.createMeeting(data.title, scheduledFor);

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        navigate(`/meeting/${response.data.id}`);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto my-12 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold">Create a Meeting</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded-md mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <div className="pt-4 flex gap-4">
            <Button type="submit" className="flex-1" isLoading={isLoading}>
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
      </div>
    </div>
  );
};

export default CreateMeeting;