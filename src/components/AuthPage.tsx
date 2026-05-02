import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useDrive } from '../lib/DriveContext';
import { motion } from 'motion/react';
import { Lock, Mail, User as UserIcon, ShieldCheck, Key } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signUp, resetPassword } = useAuth();
  const { setAccessToken } = useDrive();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signUp(email, password, name);
      }
    } catch (err: any) {
      console.error("Auth error details:", err);
      let message = 'Unexpected problem occurred. Please try again.';
      
      const errorCode = err.code || (err.message && err.message.includes('auth/') ? err.message.match(/auth\/[a-z\-]+/)[0] : '');

      if (errorCode === 'auth/email-already-in-use' || (err.message && err.message.includes('email-already-in-use'))) {
        message = 'This email is already in use. Please sign in instead.';
      } else if (errorCode === 'auth/invalid-email' || (err.message && err.message.includes('invalid-email'))) {
        message = 'Invalid email. Please provide a valid email.';
      } else if (errorCode === 'auth/weak-password' || (err.message && err.message.includes('weak-password'))) {
        message = 'Password is too weak. Please use at least 6 characters.';
      } else if (errorCode === 'auth/user-not-found' || (err.message && err.message.includes('user-not-found'))) {
        message = 'No account found with this email. Would you like to sign up?';
      } else if (errorCode === 'auth/wrong-password' || (err.message && err.message.includes('wrong-password'))) {
        message = 'Incorrect password. Please try again.';
      } else if (errorCode === 'auth/invalid-credential') {
        message = 'Incorrect email or password. Please try again.';
      } else if (errorCode === 'auth/network-request-failed') {
        message = 'Please check your internet connection.';
      } else if (errorCode === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.';
      } else if (errorCode === 'auth/operation-not-allowed' || (err.message && err.message.includes('operation-not-allowed'))) {
        message = 'Email/Password login is not enabled for this project.';
      } else if (err.message) {
        message = err.message;
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please provide your email to reset the password.');
      return;
    }
    
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage('A password reset link has been sent to your email. Please check your inbox or spam folder.');
    } catch (err: any) {
      console.error("Reset password error:", err);
      let msg = 'Failed to send password reset link. Please check your email.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100"
      >
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-black rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <ShieldCheck className="text-white w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Files.M</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {!isLogin && (
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Full Name"
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                placeholder="User ID (Email)"
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                placeholder="Password"
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>


          {error && <p className="text-red-500 text-sm font-medium px-2">{error}</p>}
          {message && <p className="text-green-600 text-sm font-medium px-2">{message}</p>}

          {isLogin && (
            <div className="flex justify-end px-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-xs text-gray-500 hover:text-black transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-4 rounded-2xl font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 mt-2 shadow-xl"
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-gray-100 pt-8">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-gray-500 hover:text-black font-semibold transition-colors text-sm"
          >
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
