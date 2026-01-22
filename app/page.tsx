'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Handle auth callback errors
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      switch (error) {
        case 'auth_callback_error':
          setError('Authentication failed. Please try again.');
          break;
        case 'unexpected_error':
          setError('An unexpected error occurred. Please try again.');
          break;
        case 'missing_code':
          setError('Authentication was incomplete. Please try again.');
          break;
        default:
          setError('Authentication error. Please try again.');
      }
    }
  }, [searchParams]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (!isLogin && (!username || !fullName)) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Password validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        // Sign In
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          console.error('Sign in error:', signInError);
          throw signInError;
        }

        if (data.user) {
          setSuccess('Successfully logged in! Redirecting...');
          setTimeout(() => {
            router.push('/dashboard');
          }, 1500);
        }
      } else {
        // Sign Up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.toLowerCase().trim(),
              full_name: fullName.trim(),
            },
          },
        });

        if (signUpError) {
          console.error('Sign up error:', signUpError);
          throw signUpError;
        }

        if (data.user) {
          setSuccess('Account created! Please check your email to verify your account.');
          // Clear form
          setEmail('');
          setPassword('');
          setUsername('');
          setFullName('');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      
      // User-friendly error messages
      if (err.message.includes('Invalid login credentials')) {
        setError('Invalid email or password');
      } else if (err.message.includes('User already registered')) {
        setError('This email is already registered. Please sign in.');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Please verify your email before signing in');
      } else {
        setError(err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    if (!resetEmail) {
      setError('Please enter your email address');
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setResetSent(true);
      setSuccess('Password reset link sent! Check your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      
      if (error) throw error;
    } catch (err: any) {
      setError('Google sign in failed: ' + err.message);
    }
  };



  return (
    <div className="min-h-screen flex">
      {/* Left Side - Image & Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#093FB4] to-[#0652e8] relative overflow-hidden">
        {/* Animated background circles */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#FFD8D8] rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#ED3500] rounded-full opacity-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-[#FFFCFB] rounded-full opacity-15 animate-bounce" style={{ animationDuration: '3s' }}></div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <div className="max-w-md text-center">
            {/* Logo/Icon */}
            <div className="mb-8 relative">
              <div className="w-32 h-32 mx-auto bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center shadow-2xl border border-white/20 p-4">
                <img 
                  src="/nearby-connect.png" 
                  alt="NearbyConnect Logo" 
                  className="w-full h-full object-contain"
                  style={{ filter: 'drop-shadow(0 4px 8px rgba(255, 255, 255, 0.3))' }}
                />
              </div>
              {/* Animated rings */}
              <div className="absolute inset-0 border-4 border-[#FFD8D8] rounded-3xl animate-ping opacity-20"></div>
            </div>

            <h1 className="text-5xl font-bold mb-4 drop-shadow-lg">
              NearbyConnect
            </h1>
            <p className="text-xl text-[#FFD8D8] mb-8">
              Discover & connect with people around you
            </p>

            {/* Feature highlights */}
            <div className="space-y-4 text-left">
              {[
                { icon: '📍', text: 'Find users within 2km radius' },
                { icon: '💬', text: 'Real-time chat messaging' },
                { icon: '🗺️', text: 'Interactive map view' },
                { icon: '🔒', text: 'Privacy-first location sharing' }
              ].map((feature, idx) => (
                <div 
                  key={idx}
                  className="flex items-center gap-3 bg-white/10 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/20 transform hover:scale-105 transition-transform"
                >
                  <span className="text-2xl">{feature.icon}</span>
                  <span className="text-[#FFFCFB]">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* Animated connection illustration */}
            <div className="mt-12 relative h-32">
              <div className="absolute left-1/4 top-0 w-12 h-12 bg-[#ED3500] rounded-full flex items-center justify-center text-2xl animate-bounce">
                👤
              </div>
              <div className="absolute right-1/4 top-0 w-12 h-12 bg-[#FFD8D8] rounded-full flex items-center justify-center text-2xl animate-bounce" style={{ animationDelay: '0.5s' }}>
                👤
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 top-8 w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#FFFCFB] relative">
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-8 left-1/2 -translate-x-1/2">
          <h1 className="text-3xl font-bold text-[#093FB4]">NearbyConnect</h1>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-10 right-10 w-20 h-20 bg-[#FFD8D8] rounded-full opacity-40 animate-pulse"></div>
        <div className="absolute bottom-10 left-10 w-16 h-16 bg-[#093FB4] rounded-full opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>

        <div className="w-full max-w-md relative z-10 mt-16 lg:mt-0">
          {/* Tab switcher */}
          <div className="flex gap-2 mb-8 p-1 bg-white rounded-xl shadow-sm">
            <button
              onClick={() => {
                setIsLogin(true);
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                isLogin
                  ? 'bg-[#093FB4] text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                !isLogin
                  ? 'bg-[#093FB4] text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </h2>
            <p className="text-gray-600 mb-6">
              {isLogin ? 'Sign in to continue' : 'Join our community today'}
            </p>

            <div className="space-y-4">
              {!isLogin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors"
                      placeholder="John Doe"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors"
                      placeholder="johndoe"
                      disabled={loading}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors"
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors"
                  placeholder="••••••••"
                  disabled={loading}
                />
                {!isLogin && (
                  <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
                )}
              </div>

              {isLogin && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-[#093FB4] rounded" />
                    <span className="text-gray-600">Remember me</span>
                  </label>
                  <button 
                    onClick={() => setShowForgotPassword(true)}
                    type="button"
                    className="text-[#093FB4] hover:text-[#ED3500] font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <div className="p-3 bg-[#FFD8D8] border border-[#ED3500] rounded-lg text-sm text-[#ED3500] flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 border border-green-500 rounded-lg text-sm text-green-700 flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  <span>{success}</span>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">Or continue with</span>
                </div>
              </div>

              <div className="w-full">
                <button 
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="font-medium text-gray-700">Continue with Google</span>
                </button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gradient-to-r from-[#FFD8D8] to-[#FFFCFB] rounded-xl border border-[#FFD8D8]">
              <p className="text-xs text-gray-700 text-center">
                ✅ <strong>Connected to Supabase!</strong> Your auth is now working.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800">Reset Password</h3>
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmail('');
                  setError('');
                  setSuccess('');
                  setResetSent(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!resetSent ? (
              <>
                <p className="text-gray-600 mb-6">
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors"
                      placeholder="you@example.com"
                      disabled={loading}
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-[#FFD8D8] border border-[#ED3500] rounded-lg text-sm text-[#ED3500]">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white font-bold py-3 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Check Your Email!</h4>
                <p className="text-gray-600 mb-6">
                  We've sent a password reset link to <strong>{resetEmail}</strong>
                </p>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmail('');
                    setResetSent(false);
                  }}
                  className="text-[#093FB4] hover:text-[#ED3500] font-medium"
                >
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#093FB4] to-[#0652e8] relative overflow-hidden">
        {/* Background animations */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#FFD8D8] rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#ED3500] rounded-full opacity-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="text-center relative z-10">
          <div className="relative mb-6">
            {/* Logo container with spinning border */}
            <div className="w-24 h-24 mx-auto relative">
              <div className="absolute inset-0 border-4 border-[#FFD8D8] border-t-transparent rounded-full animate-spin"></div>
              <div className="w-full h-full bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center p-3">
                <img 
                  src="/nearby-connect.png" 
                  alt="NearbyConnect Logo" 
                  className="w-full h-full object-contain animate-pulse"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(255, 255, 255, 0.5))' }}
                />
              </div>
            </div>
            {/* Pulsing rings */}
            <div className="absolute inset-0 border-2 border-white/30 rounded-full animate-ping"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">NearbyConnect</h2>
          <p className="text-[#FFD8D8] font-medium animate-pulse">Loading your experience...</p>
          
          {/* Loading dots */}
          <div className="flex justify-center items-center mt-4 space-x-2">
            <div className="w-2 h-2 bg-[#FFD8D8] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-[#FFD8D8] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-[#FFD8D8] rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    }>
      <AuthPage />
    </Suspense>
  );
}