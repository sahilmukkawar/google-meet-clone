import { Link } from 'react-router-dom';
import { Video, Calendar, Users, MessageCircle, Shield } from 'lucide-react';
import Button from '../components/ui/Button';

const Home = () => {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Connect with friends and family or meet new people on Video Conference.
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto">
            High-quality video meetings for everyone. Secure, reliable, and easy to use.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/join">
              <Button size="lg">
                Join a Meeting
              </Button>
            </Link>
            <Link to="/register">
              <Button variant="outline" size="lg" className="bg-white hover:bg-gray-100">
                Sign Up Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose VidChat?</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-lg">
              <div className="bg-blue-100 p-3 rounded-full mb-4">
                <Video className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Crystal Clear Video</h3>
              <p className="text-gray-600">
                Enjoy high-definition video calls with adaptive quality that works on any connection.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-lg">
              <div className="bg-blue-100 p-3 rounded-full mb-4">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Easy Scheduling</h3>
              <p className="text-gray-600">
                Schedule meetings in advance and send invitations with just a few clicks.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-lg">
              <div className="bg-blue-100 p-3 rounded-full mb-4">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Group Meetings</h3>
              <p className="text-gray-600">
                Connect with multiple people at once for team meetings or social gatherings.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center p-6 bg-gray-50 rounded-lg">
              <div className="bg-blue-100 p-3 rounded-full mb-4">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Secure Connections</h3>
              <p className="text-gray-600">
                End-to-end encryption keeps your conversations private and secure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Create an Account</h3>
              <p className="text-gray-600">
                Sign up for free and set up your profile in just a few minutes.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Schedule or Join a Meeting</h3>
              <p className="text-gray-600">
                Create a new meeting or join an existing one with a simple code.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Connect and Collaborate</h3>
              <p className="text-gray-600">
                Share your screen, chat, and communicate clearly with anyone, anywhere.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Start Connecting?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Join thousands of users who are already using VidChat for their personal and professional video conferencing needs.
          </p>
          <Link to="/register">
            <Button className="bg-white text-blue-600 hover:bg-gray-100" size="lg">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;