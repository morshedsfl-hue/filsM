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
  const { login, signUp, loginWithGoogle, resetPassword } = useAuth();
  const { setAccessToken } = useDrive();

  const handleGoogleLogin = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const credential = await loginWithGoogle();
      if (credential && credential.accessToken) {
        setAccessToken(credential.accessToken);
      }
    } catch (err: any) {
      setError('গুগল লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

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
      let message = 'অপ্রত্যাশিত সমস্যা হয়েছে। আবার চেষ্টা করুন।';
      
      const errorCode = err.code || (err.message && err.message.includes('auth/') ? err.message.match(/auth\/[a-z\-]+/)[0] : '');

      if (errorCode === 'auth/email-already-in-use' || (err.message && err.message.includes('email-already-in-use'))) {
        message = 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট করা হয়েছে। দয়া করে "Sign In" অপশন থেকে লগইন করুন।';
      } else if (errorCode === 'auth/invalid-email' || (err.message && err.message.includes('invalid-email'))) {
        message = 'ইমেইলটি সঠিক নয়। দয়া করে সঠিক ইমেইল দিন।';
      } else if (errorCode === 'auth/weak-password' || (err.message && err.message.includes('weak-password'))) {
        message = 'পাসওয়ার্ডটি অনেক দুর্বল। কমপক্ষে ৬টি অক্ষর বা সংখ্যা দিন।';
      } else if (errorCode === 'auth/user-not-found' || (err.message && err.message.includes('user-not-found'))) {
        message = 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি। আপনি কি নতুন অ্যাকাউন্ট করতে চান?';
      } else if (errorCode === 'auth/wrong-password' || (err.message && err.message.includes('wrong-password'))) {
        message = 'পাসওয়ার্ডটি ভুল হয়েছে। আবার চেষ্টা করুন।';
      } else if (errorCode === 'auth/invalid-credential') {
        message = 'ইমেইল অথবা পাসওয়ার্ড ভুল। আবার চেষ্টা করুন।';
      } else if (errorCode === 'auth/network-request-failed') {
        message = 'ইন্টারনেট কানেকশন চেক করুন।';
      } else if (errorCode === 'auth/too-many-requests') {
        message = 'অনেক বেশিবার ভুল চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
      } else if (errorCode === 'auth/operation-not-allowed' || (err.message && err.message.includes('operation-not-allowed'))) {
        message = 'এই প্রজেক্টে ইমেইল/পাসওয়ার্ড লগইন চালু করা নেই। দয়া করে গুগল দিয়ে লগইন করুন অথবা ফায়ারবেস কনসোল থেকে এটি চালু করুন।';
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
      setError('পাসওয়ার্ড রিসেট করতে আগে আপনার ইমেইলটি দিন।');
      return;
    }
    
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage('পাসওয়ার্ড রিসেট করার একটি লিঙ্ক আপনার ইমেইলে পাঠানো হয়েছে। আপনার ইনবক্স (বা স্প্যাম ফোল্ডার) চেক করুন।');
    } catch (err: any) {
      console.error("Reset password error:", err);
      let msg = 'পাসওয়ার্ড রিসেট লিঙ্ক পাঠানো ব্যর্থ হয়েছে। ইমেইলটি সঠিক কিনা চেক করুন।';
      if (err.code === 'auth/user-not-found') {
        msg = 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।';
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
              />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="email"
              placeholder="ইউজার আইডি (ইমেইল)"
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="password"
              placeholder="পাসওয়ার্ড"
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-black outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>


          {error && <p className="text-red-500 text-sm font-medium px-2">{error}</p>}
          {message && <p className="text-green-600 text-sm font-medium px-2">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-4 rounded-2xl font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 mt-4 shadow-xl"
          >
            {loading ? 'প্রসেসিং হচ্ছে...' : isLogin ? 'লগইন করুন' : 'অ্যাকাউন্ট তৈরি করুন'}
          </button>
        </form>

          <div className="mt-4 flex items-center gap-4">
            <div className="h-px bg-gray-200 flex-1" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">অথবা</span>
              {isLogin && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  title="পাসওয়ার্ড রিসেট করুন"
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-black"
                >
                  <Key className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="h-px bg-gray-200 flex-1" />
          </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full mt-4 bg-white border border-gray-200 text-gray-700 py-4 rounded-2xl font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94L5.84 14.1z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          গুগল দিয়ে লগইন করুন
        </button>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-gray-500 hover:text-black font-semibold transition-colors text-sm"
          >
            {isLogin ? "অ্যাকাউন্ট নেই? সাইনআপ করুন" : "আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
