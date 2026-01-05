
import React from 'react';

interface Props {
  onComplete: () => void;
}

export default function ProfileSetup({ onComplete }: Props) {
  return (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-bottom duration-300">
      <header className="flex flex-col items-center pt-8 mb-8">
        <div className="h-16 w-16 mb-4 flex items-center justify-center">
          <img src="logo.png" className="w-full h-full object-contain" />
        </div>
        <h2 className="text-3xl font-black text-text-main mb-2">השלמת פרופיל</h2>
        <p className="text-gray-500">בוא נכיר אותך קצת יותר</p>
      </header>

      <div className="flex flex-col items-center mb-10">
        <div className="relative group cursor-pointer">
          <div className="w-32 h-32 rounded-full bg-white border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-200 text-7xl">person</span>
          </div>
          <div className="absolute bottom-1 right-1 bg-primary text-white p-2 rounded-full border-2 border-mint-bg shadow-sm">
            <span className="material-symbols-outlined text-xl">photo_camera</span>
          </div>
        </div>
        <button className="text-primary font-bold text-sm mt-4">העלאת תמונת פרופיל (אופציונלי)</button>
      </div>

      <div className="space-y-6 flex-1">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-gray-700 mr-2">שם מלא</label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="ישראל ישראלי"
              className="w-full h-14 bg-white rounded-2xl border-none shadow-sm ring-1 ring-primary/10 focus:ring-2 focus:ring-primary pr-12 text-base font-medium"
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">person</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-gray-700 mr-2">אימייל</label>
          <div className="relative">
            <input 
              type="email" 
              placeholder="name@email.com"
              className="w-full h-14 bg-white rounded-2xl border-none shadow-sm ring-1 ring-primary/10 focus:ring-2 focus:ring-primary pr-12 text-base font-medium"
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">mail</span>
          </div>
        </div>
      </div>

      <button 
        onClick={onComplete}
        className="w-full bg-primary hover:bg-primary-dark text-white font-bold h-14 rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <span>סיום והרשמה</span>
        <span className="material-symbols-outlined text-xl">check</span>
      </button>
    </div>
  );
}
