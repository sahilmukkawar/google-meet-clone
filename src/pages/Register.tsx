import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { User, Mail, Lock, AlertCircle, ArrowLeft } from 'lucide-react';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

const Register = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.register(data.name, data.email, data.password);

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        login(response.data.user, response.data.token);
        navigate('/dashboard');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-2 text-gray-600">
              Join Google Meet to start video conferencing
            </p>
          </div>

          <div className="bg-white py-8 px-4 shadow-sm rounded-lg sm:px-10">
            {error && (
              <div className="bg-red-50 text-red-800 p-4 rounded-md mb-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <Input
                  label="Full Name"
                  placeholder="John Doe"
                  error={errors.name?.message}
                  leftIcon={<User className="h-5 w-5 text-gray-400" />}
                  {...register('name')}
                />

                <Input
                  label="Email Address"
                  type="email"
                  placeholder="you@example.com"
                  error={errors.email?.message}
                  leftIcon={<Mail className="h-5 w-5 text-gray-400" />}
                  {...register('email')}
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
                  {...register('password')}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="••••••••"
                  error={errors.confirmPassword?.message}
                  leftIcon={<Lock className="h-5 w-5 text-gray-400" />}
                  {...register('confirmPassword')}
                />
              </div>

              <div className="pt-2">
                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  isLoading={isLoading}
                >
                  Create Account
                </Button>
              </div>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Already have an account?
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <Link 
                  to="/login"
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Sign in instead
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-gray-600">
            By creating an account, you agree to our{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700">
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;