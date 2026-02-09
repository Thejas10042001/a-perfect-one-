
import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/firebaseService';
import { ICONS } from '../constants';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mapAuthError = (code: string) => {
    switch (code) {
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please try again.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/weak-password':
        return 'Password is too weak. It must be at least 6 characters.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      default:
        return 'Authentication failed. Please try again.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      setError(mapAuthError(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-2xl shadow-indigo-100 animate-in zoom-in-50 duration-700">
              <ICONS.Brain className="w-10 h-10" />
            </div>
          </div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">
            Cognitive<span className="text-indigo-600">Sales</span>
          </h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">
            Neural Strategic Intelligence Hub
          </p>
        </div>

        <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="flex p-1 bg-slate-50 rounded-2xl mb-8">
            <button 
              onClick={() => { setIsLogin(true); setError(null); }}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Login
            </button>
            <button 
              onClick={() => { setIsLogin(false); setError(null); }}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Join the Core
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Identifier</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm focus:border-indigo-500 outline-none transition-all font-semibold"
                placeholder="architect@cognitivesales.ai"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Secure Protocol Key</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm focus:border-indigo-500 outline-none transition-all font-semibold"
                placeholder="••••••••"
              />
              <p className="text-[9px] text-slate-400 px-1 italic">Minimum 6 characters required.</p>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-bold text-center animate-in fade-in">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                isLogin ? 'Initiate Link' : 'Register Profile'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] pt-4">
          Grounded Data Privacy v3.1 • End-to-End Encryption
        </p>
      </div>
    </div>
  );
};
