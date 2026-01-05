
import React from 'react';
import { LoyaltyCard } from '../types';

interface Props {
  card: LoyaltyCard;
  onBack: () => void;
}

const MOCK_HISTORY = [
  { id: 'h1', date: '12 במרץ, 2024', time: '14:20', type: 'punch', label: 'ניקוב חתימה' },
  { id: 'h2', date: '05 במרץ, 2024', time: '09:15', type: 'punch', label: 'ניקוב חתימה' },
  { id: 'h3', date: '28 בפברואר, 2024', time: '17:45', type: 'reward', label: 'מימוש הטבה - קפה חינם 🎉' },
  { id: 'h4', date: '20 בפברואר, 2024', time: '08:30', type: 'punch', label: 'ניקוב חתימה' },
];

export default function CardDetails({ card, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col animate-in slide-in-from-left duration-300 pb-10">
      <header className="p-6 flex items-center gap-4 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm">
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <h1 className="text-xl font-bold truncate">{card.businessName}</h1>
      </header>

      <main className="px-6 flex flex-col gap-8 mt-4">
        {/* Hero Card Section */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-primary/5 border border-gray-50 flex flex-col items-center text-center relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-2 ${card.color}`}></div>
          <img src={card.logo} className="size-24 rounded-3xl object-cover mb-4 shadow-md ring-4 ring-white" alt={card.businessName} />
          <h2 className="text-2xl font-black text-text-main mb-1">{card.businessName}</h2>
          <p className="text-primary font-bold mb-6">צברת {card.currentStamps} מתוך {card.maxStamps} חתימות</p>

          <div className="grid grid-cols-5 gap-3 w-full">
            {Array.from({ length: card.maxStamps }).map((_, i) => (
              <div 
                key={i} 
                className={`aspect-square rounded-2xl flex items-center justify-center border-2 transition-all duration-500 ${
                  i < card.currentStamps 
                  ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-100' 
                  : 'bg-gray-50 border-gray-100 text-gray-200'
                }`}
              >
                {i < card.currentStamps ? (
                  <span className="material-symbols-outlined text-2xl font-black">verified</span>
                ) : (
                  i === card.maxStamps - 1 ? (
                    <span className="material-symbols-outlined text-xl">redeem</span>
                  ) : (
                    <span className="text-xs font-black">{i + 1}</span>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Reward Info */}
        <section className="bg-primary/5 rounded-3xl p-6 border border-primary/10">
           <div className="flex items-center gap-3 mb-3">
              <div className="size-10 bg-primary text-white rounded-xl flex items-center justify-center">
                 <span className="material-symbols-outlined">redeem</span>
              </div>
              <h3 className="font-bold text-text-main text-lg">הפרס שלך: {card.reward}</h3>
           </div>
           <p className="text-gray-500 text-sm leading-relaxed">
             ברגע שתשלים את כל הניקובים בכרטיס, תוכל לממש את ההטבה שלך ישירות מול המוכר בקופה.
           </p>
        </section>

        {/* History Section */}
        <section className="flex flex-col gap-4">
           <h3 className="text-lg font-black text-text-main">היסטוריית ביקורים</h3>
           <div className="flex flex-col gap-4">
              {MOCK_HISTORY.map((item, idx) => (
                <div key={item.id} className="flex gap-4 relative">
                   {idx !== MOCK_HISTORY.length - 1 && (
                     <div className="absolute top-10 bottom-0 right-5 w-0.5 bg-gray-100"></div>
                   )}
                   <div className={`size-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                     item.type === 'reward' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
                   }`}>
                      <span className="material-symbols-outlined text-xl">
                        {item.type === 'reward' ? 'auto_awesome' : 'calendar_today'}
                      </span>
                   </div>
                   <div className="flex flex-col flex-1 pb-4">
                      <div className="flex justify-between items-start">
                         <span className="font-bold text-text-main">{item.label}</span>
                         <span className="text-[10px] font-bold text-gray-300 bg-gray-50 px-2 py-0.5 rounded-full">{item.time}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">{item.date}</span>
                   </div>
                </div>
              ))}
           </div>
        </section>
      </main>

      <div className="fixed bottom-6 left-6 right-6">
         <button className="w-full bg-text-main text-white py-5 rounded-2xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform">
           <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
           <span className="font-bold text-lg">הצג QR לניקוב</span>
         </button>
      </div>
    </div>
  );
}
