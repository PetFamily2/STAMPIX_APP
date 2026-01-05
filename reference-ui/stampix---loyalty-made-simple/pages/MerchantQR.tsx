
import React from 'react';

interface Props {
  onBack: () => void;
}

export default function MerchantQR({ onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-top duration-300">
      <header className="flex items-center gap-4 mb-10">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm">
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <h1 className="text-xl font-bold">הקוד של העסק שלי</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-xs bg-white rounded-[3rem] shadow-xl p-8 flex flex-col items-center text-center relative overflow-hidden border border-gray-50">
           {/* Visual Brand Strip */}
           <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
           
           <div className="mb-8 flex items-center gap-2">
              <img src="logo.png" alt="STAMPIX" className="h-10 w-auto block object-contain" loading="eager" />
              <span className="font-black text-[#1a2e44] italic tracking-tighter uppercase">STAMPIX</span>
           </div>

           <div className="relative p-6 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 mb-8">
              <div className="size-48 bg-white rounded-xl shadow-inner flex items-center justify-center p-4">
                 <img 
                   src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=STAMPIX_BIZ_123" 
                   className="w-full h-full opacity-90"
                   alt="Business QR Code"
                 />
              </div>
              <div className="absolute -top-2 -right-2 bg-blue-600 text-white size-8 rounded-full flex items-center justify-center shadow-lg">
                 <span className="material-symbols-outlined text-sm">qr_code_2</span>
              </div>
           </div>

           <h2 className="text-2xl font-black text-[#1a2e44] mb-2">סרוק והצטרף!</h2>
           <p className="text-gray-400 text-sm leading-relaxed px-4">
             הראה את הקוד הזה ללקוחות חדשים כדי לצרף אותם למועדון שלך ברגע.
           </p>
        </div>

        <div className="mt-12 flex flex-col gap-4 w-full text-[#1a2e44]">
           <button className="w-full bg-white border border-gray-100 font-bold py-4 rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-blue-600">share</span>
              שתף קישור להצטרפות
           </button>
           <button className="w-full bg-white border border-gray-100 font-bold py-4 rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-blue-600">print</span>
              הדפס פוסטר לקופה
           </button>
        </div>
      </main>

      <footer className="mt-auto pt-6 text-center">
         <p className="text-[10px] text-gray-300 uppercase tracking-widest font-bold">STAMPIX BUSINESS ENGINE v2.6.3</p>
      </footer>
    </div>
  );
}
