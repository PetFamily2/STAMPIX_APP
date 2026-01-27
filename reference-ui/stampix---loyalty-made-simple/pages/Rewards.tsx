import React from 'react';

interface Props {
  onNavigate: (page: any) => void;
}

const MOCK_REWARDS = [
  {
    id: 'r1',
    business: 'ארומה',
    gift: 'קפה קטן במתנה',
    expiry: 'בתוקף ל-48 שעות',
    color: 'bg-orange-500',
  },
  {
    id: 'r2',
    business: 'גולדה',
    gift: 'כדור גלידה מתנה',
    expiry: 'בתוקף עד סוף החודש',
    color: 'bg-amber-600',
  },
];

export default function Rewards({ onNavigate }: Props) {
  return (
    <div className="flex-1 flex flex-col pb-24 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-mint-bg/90 backdrop-blur-md px-5 py-6 flex items-center justify-center border-b border-primary/5">
        <h1 className="text-xl font-black text-primary tracking-tight uppercase">
          הטבות וקופונים
        </h1>
      </header>

      <main className="px-5 flex flex-col gap-6 mt-6 animate-in slide-in-from-left duration-300">
        <div>
          <h2 className="text-2xl font-black text-text-main">המתנות שלך 🎁</h2>
          <p className="text-gray-500 text-sm font-medium">
            כאן מופיעים כל הפרסים שמימשת בנקודות
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {MOCK_REWARDS.map((reward) => (
            <div
              key={reward.id}
              className="relative group cursor-pointer active:scale-[0.98] transition-all"
            >
              {/* Coupon Top */}
              <div
                className={`${reward.color} rounded-t-[2rem] p-6 text-white flex flex-col items-center justify-center shadow-lg`}
              >
                <span className="material-symbols-outlined text-4xl mb-2">
                  celebration
                </span>
                <h3 className="text-2xl font-black">{reward.gift}</h3>
                <p className="text-white/80 font-bold">{reward.business}</p>
              </div>
              {/* Dashed Line */}
              <div className="bg-white flex items-center justify-between px-2">
                <div className="size-6 bg-mint-bg rounded-full -ml-5 shadow-inner"></div>
                <div className="flex-1 border-t-2 border-dashed border-gray-100 mx-2"></div>
                <div className="size-6 bg-mint-bg rounded-full -mr-5 shadow-inner"></div>
              </div>
              {/* Coupon Bottom */}
              <div className="bg-white rounded-b-[2rem] p-6 flex flex-col items-center shadow-lg border-t-0">
                <p className="text-xs text-gray-400 font-bold mb-4 uppercase tracking-widest">
                  {reward.expiry}
                </p>
                <button className="w-full bg-text-main text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">qr_code_2</span>
                  מימוש הטבה
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State Suggestion */}
        <div className="mt-8 bg-white/50 border-2 border-dashed border-gray-200 rounded-[2rem] p-10 flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-gray-200 text-6xl mb-4">
            redeem
          </span>
          <p className="text-gray-400 font-medium">
            אין לך הטבות חדשות כרגע.
            <br />
            משיכים לצבור ניקובים בעסקים אהובים!
          </p>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-50 flex justify-around items-end pb-8 pt-3 z-10 px-4">
        <button
          onClick={() => onNavigate('customer_home')}
          className="flex flex-col items-center gap-1 text-gray-300"
        >
          <span className="material-symbols-outlined text-[28px]">
            account_balance_wallet
          </span>
          <span className="text-[10px] font-bold">ארנק</span>
        </button>
        <button
          onClick={() => onNavigate('rewards')}
          className="flex flex-col items-center gap-1 text-primary"
        >
          <span className="material-symbols-outlined text-[28px] material-symbols-filled">
            redeem
          </span>
          <span className="text-[10px] font-bold">הטבות</span>
        </button>
        <button
          onClick={() => onNavigate('discovery')}
          className="flex flex-col items-center gap-1 text-gray-300"
        >
          <span className="material-symbols-outlined text-[28px]">explore</span>
          <span className="text-[10px] font-bold">גילוי</span>
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className="flex flex-col items-center gap-1 text-gray-300"
        >
          <span className="material-symbols-outlined text-[28px]">menu</span>
          <span className="text-[10px] font-bold">תפריט</span>
        </button>
      </nav>
    </div>
  );
}
