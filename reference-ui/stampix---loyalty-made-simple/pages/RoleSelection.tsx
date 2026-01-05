
import React from 'react';
import { UserRole } from '../types';

interface Props {
  onSelect: (role: UserRole) => void;
}

export default function RoleSelection({ onSelect }: Props) {
  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in duration-500">
      <header className="flex flex-col items-center pt-12 pb-10">
        <div className="h-24 w-24 mb-6 flex items-center justify-center">
          <img 
            src="./logo.png" 
            className="w-full h-full block object-contain drop-shadow-lg" 
            style={{ minWidth: '80px', minHeight: '80px' }}
            loading="eager" 
          />
        </div>
        <h1 className="text-3xl font-extrabold text-text-main text-center leading-tight mb-2 italic">
          STAMPIX
        </h1>
        <p className="text-gray-500 text-center text-lg font-medium">
          בחר את התפקיד שלך כדי להתחיל
        </p>
      </header>

      <main className="flex-1 flex flex-col justify-center gap-6">
        <button 
          onClick={() => onSelect('customer')}
          className="group relative flex flex-col items-center justify-center p-6 h-44 w-full rounded-3xl bg-white border-2 border-transparent transition-all duration-300 hover:border-primary/30 hover:shadow-xl shadow-sm"
        >
          <div className="mb-3 p-4 rounded-full bg-primary/10 text-primary shadow-sm group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          </div>
          <h3 className="text-xl font-extrabold text-text-main">אני לקוח</h3>
          <p className="text-sm text-gray-400 mt-1">צבור נקודות וקבל הטבות</p>
        </button>

        <button 
          onClick={() => onSelect('merchant')}
          className="group relative flex flex-col items-center justify-center p-6 h-44 w-full rounded-3xl bg-white border-2 border-transparent transition-all duration-300 hover:border-primary/30 hover:shadow-xl shadow-sm"
        >
          <div className="mb-3 p-4 rounded-full bg-primary/10 text-primary shadow-sm group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
          </div>
          <h3 className="text-xl font-extrabold text-text-main">אני בעל עסק</h3>
          <p className="text-sm text-gray-400 mt-1">נהל מועדון לקוחות וסרוק קודים</p>
        </button>
      </main>

      <footer className="pt-10 pb-4 text-center">
        <p className="text-xs text-gray-400">
          בהמשך השימוש אתה מסכים לתנאי השימוש ומדיניות הפרטיות
        </p>
      </footer>
    </div>
  );
}
