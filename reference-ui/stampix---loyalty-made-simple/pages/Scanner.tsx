import React, { useEffect, useState } from 'react';

interface Props {
  onBack: () => void;
}

export default function Scanner({ onBack }: Props) {
  const [status, setStatus] = useState<'scanning' | 'success' | 'reward'>(
    'scanning'
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('success');
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex-1 flex flex-col relative bg-black overflow-hidden">
      {/* simulated camera view */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://picsum.photos/1080/1920?grayscale&random=99"
          className="w-full h-full object-cover opacity-60 mix-blend-overlay"
          alt="Camera background"
        />
      </div>

      <header className="relative z-20 p-6 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
        <button
          onClick={onBack}
          className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-xl">qr_code_2</span>
          </div>
          <h1 className="text-white font-black tracking-tight">STAMPIX</h1>
        </div>
        <button className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white">
          <span className="material-symbols-outlined">flash_on</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-6">
        {status === 'scanning' && (
          <>
            <div className="relative size-72 rounded-3xl border-2 border-white/30 overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
              <div className="absolute top-0 left-0 size-10 border-t-4 border-l-4 border-primary rounded-tl-2xl"></div>
              <div className="absolute top-0 right-0 size-10 border-t-4 border-r-4 border-primary rounded-tr-2xl"></div>
              <div className="absolute bottom-0 left-0 size-10 border-b-4 border-l-4 border-primary rounded-bl-2xl"></div>
              <div className="absolute bottom-0 right-0 size-10 border-b-4 border-r-4 border-primary rounded-br-2xl"></div>
              <div className="absolute top-0 left-4 right-4 h-0.5 bg-primary shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-scan opacity-80"></div>
            </div>
            <p className="mt-10 text-white font-bold text-lg">
              מקם את הקוד בתוך המסגרת
            </p>
            <p className="text-gray-400 text-sm mt-2">
              סריקה אוטומטית ברגע שהקוד מזוהה
            </p>
          </>
        )}

        {status === 'success' && (
          <div className="w-full max-w-sm bg-primary rounded-[2.5rem] p-8 flex flex-col items-center text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="size-24 bg-white/20 rounded-full flex items-center justify-center mb-6 ring-4 ring-white/10">
              <span className="material-symbols-outlined text-white text-6xl">
                check_circle
              </span>
            </div>
            <h3 className="text-3xl font-black text-white mb-2">
              הסריקה הצליחה!
            </h3>
            <p className="text-white/80 leading-relaxed mb-10">
              החותמת נוספה בהצלחה.
              <br />
              ללקוח יש כרגע 4 חותמות.
            </p>
            <button
              onClick={() => setStatus('reward')}
              className="w-full bg-white text-primary font-black py-4 rounded-2xl shadow-xl hover:bg-mint-bg transition-colors active:scale-95"
            >
              סיום
            </button>
          </div>
        )}

        {status === 'reward' && (
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 flex flex-col items-center text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="relative size-24 flex items-center justify-center mb-6">
              <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping"></div>
              <div className="relative size-full bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-6xl">
                  redeem
                </span>
              </div>
            </div>
            <h3 className="text-3xl font-black text-text-main mb-2">
              זכאות לפרס!
            </h3>
            <p className="text-gray-500 leading-relaxed mb-10">
              מזל טוב! הלקוח צבר 10 חותמות.
              <br />
              הוא זכאי לקבל את ההטבה שלך.
            </p>
            <div className="w-full flex flex-col gap-3">
              <button
                onClick={onBack}
                className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:bg-primary-dark transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined">celebration</span>
                ממש פרס
              </button>
              <button
                onClick={onBack}
                className="text-gray-400 font-bold text-sm py-2 hover:text-gray-600"
              >
                דלג לבינתיים
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-20 p-8 flex justify-center bg-gradient-to-t from-black/50 to-transparent">
        <button className="bg-white/20 backdrop-blur-md text-white font-bold py-3 px-8 rounded-full border border-white/20 flex items-center gap-2">
          <span className="material-symbols-outlined">keyboard</span>
          הזנת קוד ידנית
        </button>
      </footer>
    </div>
  );
}
