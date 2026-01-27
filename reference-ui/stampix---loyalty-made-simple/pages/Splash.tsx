import React from 'react';

export default function Splash() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-white">
      {/* Subtle radial background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-50/40 via-transparent to-transparent"></div>

      <div className="z-10 flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-1000">
        {/* The Official Logo Image Container */}
        <div className="relative w-64 h-64 flex items-center justify-center">
          {/* Animated glow background behind the logo */}
          <div className="absolute inset-8 rounded-full bg-blue-500/10 blur-3xl animate-pulse"></div>

          <img
            src="./logo.png"
            alt="STAMPIX Logo"
            className="relative z-10 w-full h-full object-contain drop-shadow-[0_10px_20px_rgba(26,46,68,0.15)]"
            style={{ minWidth: '200px', minHeight: '200px' }}
            loading="eager"
          />
        </div>

        <div className="flex flex-col items-center gap-1 text-center mt-4">
          <p className="text-sm font-black text-[#1a2e44] tracking-[0.3em] uppercase opacity-80">
            Digital Loyalty Cards
          </p>
        </div>
      </div>

      <div className="absolute bottom-20 w-full max-w-[240px] px-6">
        <div className="h-1.5 w-full rounded-full bg-blue-50 overflow-hidden relative border border-blue-100">
          <div className="absolute top-0 bottom-0 left-0 h-full rounded-full bg-blue-600 w-2/3 animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.4)]"></div>
        </div>
        <p className="text-center text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-4">
          SYSTEM LOADING • v2.6.6
        </p>
      </div>
    </div>
  );
}
