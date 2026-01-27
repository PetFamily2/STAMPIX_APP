import React, { useState } from 'react';
import { generateMarketingMessage } from '../services/geminiService';
import type { Activity } from '../types';

const MOCK_ACTIVITY: Activity[] = [
  {
    id: '1',
    customerName: 'ישראל ישראלי',
    type: 'punch',
    time: '10:42',
    avatar: 'https://picsum.photos/100/100?u=1',
  },
  {
    id: '2',
    customerName: 'מיכל לוי',
    type: 'reward',
    time: '09:15',
    avatar: 'https://picsum.photos/100/100?u=2',
  },
  {
    id: '3',
    customerName: 'דני כהן',
    type: 'punch',
    time: '08:50',
    avatar: 'https://picsum.photos/100/100?u=3',
  },
];

interface Props {
  onNavigate: (page: any) => void;
}

export default function MerchantDashboard({ onNavigate }: Props) {
  return (
    <div className="flex-1 flex flex-col pb-24 overflow-y-auto">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-5 py-3 flex items-center justify-between border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <img
            src="./logo.png"
            className="h-10 w-auto block object-contain"
            style={{ minWidth: '40px' }}
            loading="eager"
          />
          <span className="text-xl font-black text-[#1a2e44] italic tracking-tighter uppercase text-primary">
            STAMPIX
          </span>
        </div>
        <button
          onClick={() => onNavigate('merchant_profile')}
          className="size-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400"
        >
          <span className="material-symbols-outlined">account_circle</span>
        </button>
      </header>

      <main className="px-5 flex flex-col gap-6 mt-4 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-black text-text-main leading-tight text-right">
              שלום, קפה ארומה 👋
            </h2>
            <button
              onClick={() => onNavigate('merchant_qr')}
              className="size-10 bg-white rounded-full shadow-sm text-blue-600 flex items-center justify-center border border-blue-50"
            >
              <span className="material-symbols-outlined">qr_code_2</span>
            </button>
          </div>
          <p className="text-gray-500 text-sm font-medium text-right">
            כאן סקירה מהירה של הפעילות היומית בעסק
          </p>
        </div>

        <button
          onClick={() => onNavigate('scanner')}
          className="w-full bg-blue-600 text-white h-20 rounded-3xl shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all group"
        >
          <div className="bg-white/20 p-2 rounded-xl">
            <span className="material-symbols-outlined text-white text-3xl">
              qr_code_scanner
            </span>
          </div>
          <span className="text-xl font-black tracking-wide">סריקת לקוח</span>
        </button>

        <div className="grid grid-cols-3 gap-3">
          <div
            onClick={() => onNavigate('merchant_analytics')}
            className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center justify-center gap-1.5 min-h-[120px] cursor-pointer hover:border-blue-200 transition-colors"
          >
            <div className="size-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-xl">
                verified
              </span>
            </div>
            <span className="text-2xl font-black text-text-main leading-none">
              24
            </span>
            <span className="text-[11px] text-gray-400 font-bold text-center leading-tight">
              ניקובים היום
            </span>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center justify-center gap-1.5 min-h-[120px]">
            <div className="size-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-xl">
                person_add
              </span>
            </div>
            <span className="text-2xl font-black text-text-main leading-none">
              5
            </span>
            <span className="text-[11px] text-gray-400 font-bold text-center leading-tight">
              לקוחות חדשים
            </span>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center justify-center gap-1.5 min-h-[120px]">
            <div className="size-9 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-xl">redeem</span>
            </div>
            <span className="text-2xl font-black text-text-main leading-none">
              2
            </span>
            <span className="text-[11px] text-gray-400 font-bold text-center leading-tight">
              הטבות מומשו
            </span>
          </div>
        </div>

        <button
          onClick={() => onNavigate('merchant_store_settings')}
          className="flex items-center justify-between bg-white px-6 py-5 rounded-[2.5rem] shadow-sm border border-blue-100 group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined">edit_note</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-text-main block">
                הגדרות כרטיס והטבות
              </span>
              <span className="text-[10px] text-gray-400">
                ערוך פרסים, ניקובים ומיתוג
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-blue-300 transform rotate-180">
            chevron_left
          </span>
        </button>

        <button
          onClick={() => onNavigate('employee_mgmt')}
          className="flex items-center justify-between bg-white px-6 py-5 rounded-[2.5rem] shadow-sm border border-gray-100 group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 bg-gray-50 text-gray-600 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined">badge</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-text-main block">
                ניהול צוות עובדים
              </span>
              <span className="text-[10px] text-gray-400">
                הרשאות, משמרות וניטור פעילות
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-gray-300 transform rotate-180">
            chevron_left
          </span>
        </button>

        <section className="bg-[#1a2e44] p-5 rounded-[2.5rem] text-white shadow-lg relative overflow-hidden flex items-center gap-4">
          <div className="size-14 bg-white/10 rounded-2xl flex items-center justify-center text-blue-400 relative z-10">
            <span className="material-symbols-outlined text-3xl">movie</span>
          </div>
          <div className="flex-1 relative z-10 text-right">
            <h3 className="font-bold">סרטון פרסומת ב-AI</h3>
            <p className="text-xs text-blue-200/60">צור תוכן שיווקי לעסק שלך</p>
          </div>
          <button
            onClick={() => onNavigate('video_generator')}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-transform z-10"
          >
            יצירה
          </button>
          <span className="material-symbols-outlined absolute -bottom-10 -right-10 text-[180px] opacity-5 rotate-12 text-blue-400">
            auto_videocam
          </span>
        </section>

        <div className="flex flex-col gap-4 mb-4">
          <h3 className="text-lg font-black text-text-main px-1 text-right">
            פעילות אחרונה
          </h3>
          <div className="flex flex-col gap-3">
            {MOCK_ACTIVITY.map((act) => (
              <div
                key={act.id}
                className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex items-center justify-between group active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0 flex-row-reverse text-right">
                  <img
                    src={act.avatar}
                    className="size-12 rounded-2xl shadow-sm"
                    alt={act.customerName}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-base font-bold text-text-main truncate">
                      {act.customerName}
                    </span>
                    <span
                      className={`text-xs font-bold ${act.type === 'punch' ? 'text-gray-400' : 'text-blue-600'}`}
                    >
                      {act.type === 'punch'
                        ? 'קיבל/ה ניקוב 1'
                        : 'מימש/ה הטבה 🎉'}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded-lg">
                  {act.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-50 flex justify-around items-end pb-8 pt-3 z-10 px-4 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
        <button
          onClick={() => onNavigate('merchant_home')}
          className="flex flex-col items-center gap-1 text-blue-600"
        >
          <span className="material-symbols-outlined text-[28px] material-symbols-filled">
            grid_view
          </span>
          <span className="text-[10px] font-bold">לוח בקרה</span>
        </button>
        <button
          onClick={() => onNavigate('merchant_analytics')}
          className="flex flex-col items-center gap-1 text-gray-300"
        >
          <span className="material-symbols-outlined text-[28px]">
            bar_chart
          </span>
          <span className="text-[10px] font-bold">סטטיסטיקה</span>
        </button>
        <button
          onClick={() => onNavigate('scanner')}
          className="flex flex-col items-center gap-1 text-gray-300 -mt-8"
        >
          <div className="size-16 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center border-4 border-white transform hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-[32px]">
              qr_code_scanner
            </span>
          </div>
          <span className="text-[10px] font-bold text-gray-400">סריקה</span>
        </button>
        <button
          onClick={() => onNavigate('merchant_profile')}
          className="flex flex-col items-center gap-1 text-gray-300"
        >
          <span className="material-symbols-outlined text-[28px]">
            account_circle
          </span>
          <span className="text-[10px] font-bold">חשבון</span>
        </button>
      </nav>
    </div>
  );
}
