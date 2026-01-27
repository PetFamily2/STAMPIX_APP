import React from 'react';

interface Props {
  onNavigate: (page: any) => void;
}

const FEATURED_BUSINESSES = [
  {
    id: 'f1',
    name: 'בית השוקולד',
    type: 'מתיקה',
    img: 'https://picsum.photos/400/200?chocolate',
    offer: 'פרלין מתנה בהצטרפות',
  },
  {
    id: 'f2',
    name: 'המספרה של רוני',
    type: 'טיפוח',
    img: 'https://picsum.photos/400/200?hair',
    offer: '10% הנחה על תספורת ראשונה',
  },
  {
    id: 'f3',
    name: 'פיצה פאמיליה',
    type: 'אוכל',
    img: 'https://picsum.photos/400/200?pizza',
    offer: 'תוספת חינם בהזמנה',
  },
];

export default function Discovery({ onNavigate }: Props) {
  return (
    <div className="flex-1 flex flex-col pb-24 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-mint-bg/90 backdrop-blur-md px-5 py-6 border-b border-primary/5">
        <div className="relative">
          <input
            type="text"
            placeholder="חפש עסקים סביבך..."
            className="w-full h-12 bg-white rounded-2xl border-none shadow-sm ring-1 ring-gray-100 pr-12 text-sm font-medium focus:ring-2 focus:ring-primary"
          />
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
            search
          </span>
        </div>
      </header>

      <main className="px-5 flex flex-col gap-8 mt-6 animate-in slide-in-from-right duration-300">
        <div>
          <h2 className="text-2xl font-black text-text-main mb-1">
            גלה עסקים חדשים
          </h2>
          <p className="text-gray-500 text-sm font-medium">
            עסקים שמחכים לך ממש מעבר לפינה
          </p>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5">
          {['קפה', 'מסעדות', 'טיפוח', 'אופנה', 'כושר'].map((cat, i) => (
            <button
              key={i}
              className={`whitespace-nowrap px-6 py-2 rounded-full font-bold text-sm ${i === 0 ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-400 border border-gray-100'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          {FEATURED_BUSINESSES.map((biz) => (
            <div
              key={biz.id}
              className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-gray-50 flex flex-col active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="h-40 relative">
                <img
                  src={biz.img}
                  className="w-full h-full object-cover"
                  alt={biz.name}
                />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-primary uppercase shadow-sm">
                  {biz.type}
                </div>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-black text-text-main">
                      {biz.name}
                    </h3>
                    <p className="text-primary text-sm font-bold mt-1">
                      {biz.offer}
                    </p>
                  </div>
                  <button className="size-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined">add</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                  <span className="material-symbols-outlined text-sm">
                    location_on
                  </span>
                  <span>400 מטר ממך</span>
                  <span className="mx-1">•</span>
                  <span className="material-symbols-outlined text-sm text-amber-400">
                    star
                  </span>
                  <span>4.8 (120 ביקורות)</span>
                </div>
              </div>
            </div>
          ))}
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
          className="flex flex-col items-center gap-1 text-gray-300"
        >
          <span className="material-symbols-outlined text-[28px]">redeem</span>
          <span className="text-[10px] font-bold">הטבות</span>
        </button>
        <button
          onClick={() => onNavigate('discovery')}
          className="flex flex-col items-center gap-1 text-primary"
        >
          <span className="material-symbols-outlined text-[28px] material-symbols-filled">
            explore
          </span>
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
