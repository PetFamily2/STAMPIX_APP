
import React, { useState } from 'react';

interface Props {
  onBack: () => void;
  onNavigate: (page: any) => void;
  tier: string;
}

export default function MerchantProfileSettings({ onBack, onNavigate, tier }: Props) {
  const [activeSection, setActiveSection] = useState<'profile' | 'billing' | 'legal'>('profile');

  return (
    <div className="flex-1 flex flex-col pb-10 overflow-y-auto animate-in slide-in-from-right duration-300 bg-mint-bg">
      <header className="p-6 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm flex items-center justify-center">
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <h1 className="text-xl font-black text-text-main">הגדרות וחשבון</h1>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="px-6 mt-8 flex-1 flex flex-col gap-8">
        
        {/* Merchant Hero */}
        <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 flex flex-col items-center text-center">
           <div className="relative group mb-4">
              <div className="size-24 rounded-[2rem] bg-gray-100 flex items-center justify-center overflow-hidden">
                 <img src="https://picsum.photos/200/200?u=merchant" alt="Profile" className="w-full h-full object-cover" />
              </div>
              <button className="absolute -bottom-1 -right-1 size-8 bg-blue-600 text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                 <span className="material-symbols-outlined text-sm">edit</span>
              </button>
           </div>
           <h2 className="text-2xl font-black text-text-main">ארומה אספרסו בר</h2>
           <p className="text-gray-400 text-sm font-bold mt-1">ניהול חשבון ראשי</p>
        </section>

        {/* Menu Navigation */}
        <div className="flex flex-col gap-3">
           
           {/* Section: Personal Info */}
           <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-50 flex flex-col gap-1">
              <button className="flex items-center justify-between p-4 flex-row-reverse group">
                 <div className="flex items-center gap-4 flex-row-reverse text-right">
                    <div className="size-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                       <span className="material-symbols-outlined">person</span>
                    </div>
                    <div>
                       <span className="font-bold text-text-main block">פרטי בעל העסק</span>
                       <span className="text-[10px] text-gray-400">שם, טלפון, אימייל וסיסמה</span>
                    </div>
                 </div>
                 <span className="material-symbols-outlined text-gray-300 transform rotate-180">chevron_left</span>
              </button>
           </div>

           {/* Section: Subscription */}
           <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-50 flex flex-col gap-1">
              <button 
                onClick={() => onNavigate('checkout')}
                className="flex items-center justify-between p-4 flex-row-reverse group"
              >
                 <div className="flex items-center gap-4 flex-row-reverse text-right">
                    <div className="size-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                       <span className="material-symbols-outlined">credit_card</span>
                    </div>
                    <div>
                       <span className="font-bold text-text-main block">מנוי ותשלומים</span>
                       <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight">מנוי {tier} פעיל</span>
                    </div>
                 </div>
                 <span className="material-symbols-outlined text-gray-300 transform rotate-180">chevron_left</span>
              </button>
              <div className="px-4 py-2 bg-gray-50 rounded-2xl mx-2 mb-2 flex justify-between items-center flex-row-reverse">
                 <span className="text-[10px] font-bold text-gray-400">חיוב הבא: 12/04/2024</span>
                 <button className="text-[10px] font-black text-blue-600">צפה בחשבוניות</button>
              </div>
           </div>

           {/* Section: Privacy & Legal */}
           <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-50 flex flex-col gap-1">
              <button className="flex items-center justify-between p-4 flex-row-reverse group">
                 <div className="flex items-center gap-4 flex-row-reverse text-right">
                    <div className="size-10 bg-gray-50 text-gray-600 rounded-xl flex items-center justify-center">
                       <span className="material-symbols-outlined">gavel</span>
                    </div>
                    <span className="font-bold text-text-main">תקנון ותנאי שימוש</span>
                 </div>
                 <span className="material-symbols-outlined text-gray-300 transform rotate-180">chevron_left</span>
              </button>
              <button className="flex items-center justify-between p-4 flex-row-reverse group">
                 <div className="flex items-center gap-4 flex-row-reverse text-right">
                    <div className="size-10 bg-gray-50 text-gray-600 rounded-xl flex items-center justify-center">
                       <span className="material-symbols-outlined">lock_person</span>
                    </div>
                    <span className="font-bold text-text-main">הגדרות פרטיות</span>
                 </div>
                 <span className="material-symbols-outlined text-gray-300 transform rotate-180">chevron_left</span>
              </button>
           </div>

           {/* Logout Button */}
           <button 
             onClick={() => onNavigate('splash')}
             className="w-full bg-white text-red-500 font-black py-5 rounded-[2rem] shadow-sm border border-red-50 mt-4 flex items-center justify-center gap-2 active:scale-95 transition-all"
           >
              <span className="material-symbols-outlined">logout</span>
              התנתק מהמערכת
           </button>
        </div>

        <div className="mt-auto py-8 text-center">
           <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">STAMPIX OS • v2.6.8 • Production</p>
        </div>
      </main>
    </div>
  );
}
