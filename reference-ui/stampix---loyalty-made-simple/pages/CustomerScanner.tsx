import React, { useEffect, useState } from 'react';

interface Props {
  onBack: () => void;
}

export default function CustomerScanner({ onBack }: Props) {
  const [status, setStatus] = useState<'scanning' | 'success'>('scanning');

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('success');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex-1 flex flex-col relative bg-black overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-40">
        <img
          src="https://picsum.photos/1080/1920?grayscale&blur=5"
          className="w-full h-full object-cover"
          alt="Camera background"
        />
      </div>

      <header className="relative z-20 p-6 flex justify-between items-center">
        <button
          onClick={onBack}
          className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="bg-primary/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
          <span className="text-white font-bold text-sm tracking-wide">
            סורק עסקים
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-6">
        {status === 'scanning' && (
          <div className="text-center">
            <div className="relative size-64 rounded-[3rem] border-2 border-white/20 overflow-hidden mb-10 ring-[600px] ring-black/60">
              <div className="absolute top-0 left-0 size-12 border-t-4 border-l-4 border-primary rounded-tl-[2rem]"></div>
              <div className="absolute top-0 right-0 size-12 border-t-4 border-r-4 border-primary rounded-tr-[2rem]"></div>
              <div className="absolute bottom-0 left-0 size-12 border-b-4 border-l-4 border-primary rounded-bl-[2rem]"></div>
              <div className="absolute bottom-0 right-0 size-12 border-b-4 border-r-4 border-primary rounded-br-[2rem]"></div>
              <div className="absolute top-0 left-2 right-2 h-1 bg-primary/80 shadow-[0_0_20px_#10B981] animate-scan"></div>
            </div>
            <h3 className="text-white text-xl font-bold mb-2">
              סרוק את הקוד של העסק
            </h3>
            <p className="text-white/50 text-sm">
              הצטרף למועדון והתחל לצבור נקודות
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 flex flex-col items-center text-center shadow-2xl animate-in zoom-in duration-500">
            <div className="size-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-6 text-primary">
              <span className="material-symbols-outlined text-5xl">
                storefront
              </span>
            </div>
            <h3 className="text-2xl font-black text-text-main mb-2">
              ברוך הבא ל"קפה ארומה"!
            </h3>
            <p className="text-gray-500 leading-relaxed mb-8">
              הצטרפת בהצלחה למועדון הלקוחות. <br />
              כרטיס הנאמנות שלך מוכן ומחכה בארנק.
            </p>
            <button
              onClick={onBack}
              className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl hover:bg-primary-dark transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">
                account_balance_wallet
              </span>
              עבור לארנק
            </button>
          </div>
        )}
      </main>

      <footer className="relative z-20 p-8 flex justify-center">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3 border border-white/10">
          <span className="material-symbols-outlined text-primary">info</span>
          <p className="text-white/70 text-xs">חפש קוד QR ליד הקופה של העסק</p>
        </div>
      </footer>
    </div>
  );
}
