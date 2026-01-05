
import React from 'react';
import { MerchantTier } from '../types';

interface Props {
  onSelect: (tier: MerchantTier) => void;
}

export default function PlanSelection({ onSelect }: Props) {
  const plans = [
    {
      id: 'starter' as MerchantTier,
      name: 'Starter',
      price: '₪0',
      period: 'חינם לתמיד',
      color: 'bg-gray-100 text-gray-800',
      features: ['כרטיס נאמנות 1', 'עד 100 לקוחות', 'סריקה דרך הנייד', 'סטטיסטיקה בסיסית'],
      notIncluded: ['כלי שיווק AI', 'ניהול עובדים', 'תמיכה טלפונית']
    },
    {
      id: 'pro' as MerchantTier,
      name: 'Pro',
      price: '₪99',
      period: 'לחודש',
      recommended: true,
      color: 'bg-primary text-white',
      features: ['עד 5 כרטיסי נאמנות', 'לקוחות ללא הגבלה', 'כלי שיווק AI', 'ניהול צוות עובדים', 'דוחות מתקדמים'],
      notIncluded: ['מיתוג אישי מלא']
    },
    {
      id: 'unlimited' as MerchantTier,
      name: 'Unlimited',
      price: '₪199',
      period: 'לחודש',
      color: 'bg-primary-dark text-white',
      features: ['כרטיסים ללא הגבלה', 'סרטוני פרסומת AI', 'מיתוג אישי (White Label)', 'מנהל חשבון אישי', 'API למערכות חיצוניות'],
      notIncluded: []
    }
  ];

  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-bottom duration-500 bg-mint-bg">
      <header className="flex flex-col items-center text-center mt-6 mb-10">
        <h1 className="text-3xl font-black text-text-main mb-2">בחר את המסלול שלך</h1>
        <p className="text-gray-500">הצטרף למשפחת STAMPIX והתחל לצמוח</p>
      </header>

      <div className="flex flex-col gap-6 flex-1 overflow-y-auto pb-10">
        {plans.map((plan) => (
          <div 
            key={plan.id}
            onClick={() => onSelect(plan.id)}
            className={`relative rounded-[2.5rem] p-8 border-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
              plan.recommended ? 'bg-white border-primary shadow-xl shadow-primary/10' : 'bg-white/80 border-gray-100 opacity-90'
            }`}
          >
            {plan.recommended && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-6 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg">
                הכי פופולרי
              </div>
            )}

            <div className="flex justify-between items-start mb-6 flex-row-reverse">
              <div className="text-right">
                <h3 className="text-2xl font-black text-text-main">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1 flex-row-reverse">
                   <span className="text-3xl font-black text-primary">{plan.price}</span>
                   <span className="text-xs text-gray-400 font-bold">{plan.period}</span>
                </div>
              </div>
              <div className={`size-12 rounded-2xl flex items-center justify-center ${plan.id === 'starter' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-primary'}`}>
                 <span className="material-symbols-outlined text-3xl">
                   {plan.id === 'starter' ? 'token' : plan.id === 'pro' ? 'verified' : 'stars'}
                 </span>
              </div>
            </div>

            <div className="space-y-3 mb-8">
               {plan.features.map((f, i) => (
                 <div key={i} className="flex items-center gap-3 flex-row-reverse text-right">
                    <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                    <span className="text-sm font-bold text-gray-700">{f}</span>
                 </div>
               ))}
               {plan.notIncluded.map((f, i) => (
                 <div key={i} className="flex items-center gap-3 flex-row-reverse text-right opacity-40">
                    <span className="material-symbols-outlined text-gray-300 text-lg">cancel</span>
                    <span className="text-sm font-bold text-gray-400">{f}</span>
                 </div>
               ))}
            </div>

            <button className={`w-full py-4 rounded-2xl font-black transition-all ${
              plan.recommended ? 'bg-primary text-white shadow-lg' : 'bg-gray-50 text-gray-400 border border-gray-100'
            }`}>
               בחר במסלול זה
            </button>
          </div>
        ))}
      </div>

      <footer className="py-6 text-center">
         <p className="text-[10px] text-gray-400 font-bold uppercase">ניתן לשנות מסלול בכל עת בהגדרות החשבון</p>
      </footer>
    </div>
  );
}
