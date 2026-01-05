
import React, { useState, useEffect } from 'react';
import { LoyaltyCard } from '../types';
import { backendService, supabase } from '../services/backendService';

interface Props {
  onNavigate: (page: any) => void;
  onCardClick: (card: LoyaltyCard) => void;
  activeTab: 'wallet' | 'rewards' | 'discovery' | 'settings';
}

export default function CustomerDashboard({ onNavigate, onCardClick, activeTab }: Props) {
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const myCards = await backendService.getMyCards(user.id);
        setCards(myCards);
      }
    } catch (err: any) {
      console.error("Fetch Cards Error:", err);
      setError("לא הצלחנו לטעון את הכרטיסים שלך. בדוק את החיבור.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-24 overflow-y-auto">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-5 py-3 flex items-center justify-between border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
           <img src="./logo.png" className="h-10 w-auto block object-contain" style={{ minWidth: '40px' }} />
           <span className="text-xl font-black text-[#1a2e44] italic tracking-tighter uppercase text-primary">STAMPIX</span>
        </div>
        <button onClick={fetchCards} className="p-2 text-gray-400">
           <span className={`material-symbols-outlined ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </header>

      <main className="px-5 flex flex-col gap-6 mt-4 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-text-main">הארנק שלי</h2>
            <p className="text-gray-500 text-sm">כל ההטבות שלך במקום אחד</p>
          </div>
          <button 
            onClick={() => onNavigate('customer_scanner')}
            className="size-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-600 border border-blue-50 active:scale-90 transition-transform"
          >
            <span className="material-symbols-outlined text-3xl">add_a_photo</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[1, 2].map(i => (
              <div key={i} className="h-40 bg-white/50 animate-pulse rounded-[2rem] border border-gray-100"></div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-rose-50 p-6 rounded-[2rem] text-center border border-rose-100">
             <p className="text-rose-600 font-bold mb-4">{error}</p>
             <button onClick={fetchCards} className="bg-white px-6 py-2 rounded-xl text-sm font-black border border-rose-200">נסה שוב</button>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center px-10">
             <div className="size-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-gray-200 text-5xl">wallet</span>
             </div>
             <h3 className="text-xl font-black text-text-main">הארנק ריק...</h3>
             <p className="text-gray-400 text-sm mt-2 leading-relaxed">עדיין לא הצטרפת למועדונים. סרוק קוד QR של עסק כדי להתחיל!</p>
             <button 
              onClick={() => onNavigate('discovery')}
              className="mt-8 bg-primary text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-primary/20"
             >
               גלה עסקים בסביבה
             </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {cards.map(card => (
              <div 
                key={card.id} 
                onClick={() => onCardClick(card)}
                className="bg-white rounded-[2rem] p-5 shadow-sm border border-gray-50 relative overflow-hidden group active:scale-[0.98] transition-transform cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div className={`size-16 rounded-2xl flex items-center justify-center text-white ${card.color || 'bg-blue-600'}`}>
                    <span className="material-symbols-outlined text-3xl">storefront</span>
                  </div>
                  <div className="flex-1 min-w-0">
                     <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-lg text-text-main truncate">{card.businessName}</h3>
                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {card.currentStamps}/{card.maxStamps}
                        </span>
                     </div>
                     <p className="text-sm text-gray-400 mb-3 truncate">לקבלת {card.reward}</p>
                     
                     <div className="flex gap-1.5 flex-wrap">
                        {Array.from({ length: card.maxStamps }).map((_, i) => (
                          <div key={i} className={`size-6 rounded-full flex items-center justify-center border-2 ${i < card.currentStamps ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-100 bg-gray-50'}`}>
                             {i < card.currentStamps ? (
                               <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                             ) : (
                               i === card.maxStamps - 1 && <span className="material-symbols-outlined text-[14px] text-gray-200">redeem</span>
                             )}
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
                <div className={`absolute top-0 left-0 w-1.5 h-full ${card.color || 'bg-blue-600'}`}></div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-end pb-8 pt-3 z-10 px-4 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
        <button onClick={() => onNavigate('customer_home')} className={`flex flex-col items-center gap-1 ${activeTab === 'wallet' ? 'text-blue-600' : 'text-gray-300'}`}>
          <span className={`material-symbols-outlined text-[28px] ${activeTab === 'wallet' ? 'material-symbols-filled' : ''}`}>account_balance_wallet</span>
          <span className="text-[10px] font-bold">ארנק</span>
        </button>
        <button onClick={() => onNavigate('rewards')} className={`flex flex-col items-center gap-1 ${activeTab === 'rewards' ? 'text-blue-600' : 'text-gray-300'}`}>
          <span className={`material-symbols-outlined text-[28px] ${activeTab === 'rewards' ? 'material-symbols-filled' : ''}`}>redeem</span>
          <span className="text-[10px] font-bold">הטבות</span>
        </button>
        <button onClick={() => onNavigate('discovery')} className={`flex flex-col items-center gap-1 ${activeTab === 'discovery' ? 'text-blue-600' : 'text-gray-300'}`}>
          <span className={`material-symbols-outlined text-[28px] ${activeTab === 'discovery' ? 'material-symbols-filled' : ''}`}>explore</span>
          <span className="text-[10px] font-bold">גילוי</span>
        </button>
        <button onClick={() => onNavigate('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-300'}`}>
          <span className={`material-symbols-outlined text-[28px] ${activeTab === 'settings' ? 'material-symbols-filled' : ''}`}>menu</span>
          <span className="text-[10px] font-bold">תפריט</span>
        </button>
      </nav>
    </div>
  );
}
