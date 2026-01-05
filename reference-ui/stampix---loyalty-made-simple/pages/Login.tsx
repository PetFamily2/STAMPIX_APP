
import React, { useState } from 'react';
import { UserRole } from '../types';
import { backendService } from '../services/backendService';

interface Props {
  role: UserRole;
  onBack: () => void;
  onSuccess: (isAdmin?: boolean, isNewUser?: boolean) => void;
}

export default function Auth({ role, onBack, onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const translateError = (msg: string) => {
    if (msg.includes('Forbidden use of secret API key')) return 'שגיאת אבטחה: השתמשת במפתח Secret במקום במפתח Anon הציבורי. אנא החלף את המפתח ב-backendService.ts';
    if (msg.includes('Invalid API key')) return 'שגיאת מפתח API! וודא שהזנת מפתח Supabase תקין ב-backendService.ts';
    if (msg.includes('Invalid login credentials')) return 'אימייל או סיסמה שגויים. וודא שנרשמת קודם במערכת.';
    if (msg.includes('User already registered')) return 'משתמש עם אימייל זה כבר קיים במערכת.';
    if (msg.includes('Password should be at least 6 characters')) return 'הסיסמה חייבת להכיל לפחות 6 תווים.';
    return msg;
  };

  const handleAction = async () => {
    setError(null);
    if (!formData.email || !formData.password) {
      setError('נא למלא את שדות החובה');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        const { user } = await backendService.login(formData.email, formData.password);
        const isAdmin = formData.email.includes('admin@stampix');
        onSuccess(isAdmin, false);
      } else {
        if (!formData.fullName) {
          setError('נא למלא שם מלא');
          setIsLoading(false);
          return;
        }
        await backendService.register(formData.email, formData.password, role);
        onSuccess(false, true);
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      setError(translateError(err.message || 'אירעה שגיאת חיבור לשרת. בדוק את הגדרות ה-API.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-mint-bg">
      <header className="flex items-center justify-between py-4 mb-4">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <div className="flex flex-col items-center">
           <img src="./logo.png" className="h-10 w-auto opacity-20 grayscale" alt="STAMPIX" />
        </div>
        <div className="w-10"></div>
      </header>

      <div className="flex flex-col items-center text-center mb-8">
        <div className="size-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-primary">
          <span className="material-symbols-outlined text-4xl">
            {role === 'merchant' ? 'storefront' : 'person'}
          </span>
        </div>
        <h2 className="text-2xl font-black text-text-main">
          {role === 'merchant' ? 'חשבון עסקי STAMPIX' : 'חשבון לקוח STAMPIX'}
        </h2>
        <p className="text-gray-400 text-sm font-bold mt-1 uppercase tracking-widest">
          {mode === 'login' ? 'כניסה למערכת' : 'הרשמה למערכת'}
        </p>
      </div>

      <div className="flex bg-white/50 p-1.5 rounded-2xl mb-8 self-center w-full max-w-[280px] shadow-inner ring-1 ring-gray-200">
        <button 
          onClick={() => setMode('login')}
          className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${mode === 'login' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}
        >
          התחברות
        </button>
        <button 
          onClick={() => setMode('register')}
          className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${mode === 'register' ? 'bg-primary text-white shadow-md' : 'text-gray-400'}`}
        >
          הרשמה
        </button>
      </div>

      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full gap-4">
        <div className="space-y-3">
          {mode === 'register' && (
            <div className="animate-in slide-in-from-top-2 duration-300 space-y-3">
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="שם מלא"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  className="w-full h-14 bg-white rounded-2xl border-none shadow-sm ring-1 ring-gray-100 focus:ring-2 focus:ring-primary pr-12 text-sm font-bold"
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-primary transition-colors">badge</span>
              </div>
            </div>
          )}

          <div className="relative group">
            <input 
              type="email" 
              placeholder="אימייל"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full h-14 bg-white rounded-2xl border-none shadow-sm ring-1 ring-gray-100 focus:ring-2 focus:ring-primary pr-12 text-sm font-bold transition-all"
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-primary transition-colors">mail</span>
          </div>

          <div className="relative group">
            <input 
              type="password" 
              placeholder="סיסמה (לפחות 6 תווים)"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className="w-full h-14 bg-white rounded-2xl border-none shadow-sm ring-1 ring-gray-100 focus:ring-2 focus:ring-primary pr-12 text-sm font-bold transition-all"
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-primary transition-colors">lock</span>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-xs font-black border border-rose-100 animate-in slide-in-from-top-2 text-center">
            {error}
          </div>
        )}

        <button 
          onClick={handleAction}
          disabled={isLoading}
          className="w-full bg-primary hover:bg-primary-dark text-white font-black h-16 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 mt-4"
        >
          {isLoading ? (
            <div className="size-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span>{mode === 'login' ? 'כניסה למערכת' : 'צור חשבון חדש'}</span>
              <span className="material-symbols-outlined transform rotate-180">
                {mode === 'login' ? 'login' : 'person_add'}
              </span>
            </>
          )}
        </button>
      </div>

      <footer className="mt-auto py-6 text-center">
         <div className="flex items-center justify-center gap-2 text-[10px] text-gray-300 font-black uppercase tracking-widest">
            <span className="material-symbols-outlined text-[12px]">security</span>
            STAMPIX LIVE • v4.1
         </div>
      </footer>
    </div>
  );
}
