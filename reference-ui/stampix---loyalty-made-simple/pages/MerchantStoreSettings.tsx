import React, { useState } from 'react';

interface Props {
  onBack: () => void;
  onNavigate: (page: any) => void;
  tier: 'starter' | 'pro' | 'unlimited';
}

export default function MerchantStoreSettings({
  onBack,
  onNavigate,
  tier,
}: Props) {
  const [storeName, setStoreName] = useState('קפה ארומה');
  const [rewardText, setRewardText] = useState('קפה ומאפה חינם');
  const [maxStamps, setMaxStamps] = useState(10);
  const [brandColor, setBrandColor] = useState('bg-blue-600');
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false); // New lock state
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const colors = [
    { class: 'bg-blue-600', name: 'כחול מותג' },
    { class: 'bg-orange-500', name: 'כתום ארומה' },
    { class: 'bg-amber-600', name: 'זהב גולדה' },
    { class: 'bg-green-600', name: 'ירוק רענן' },
    { class: 'bg-rose-500', name: 'ורוד פסטל' },
    { class: 'bg-zinc-800', name: 'שחור יוקרתי' },
  ];

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      onBack();
    }, 1500);
  };

  const confirmLock = () => {
    setIsLocked(true);
    setShowLockConfirm(false);
  };

  return (
    <div className="flex-1 flex flex-col pb-24 overflow-y-auto animate-in slide-in-from-bottom duration-300 bg-mint-bg">
      <header className="p-6 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 bg-white rounded-full shadow-sm flex items-center justify-center"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <h1 className="text-xl font-black text-text-main">הגדרות כרטיס</h1>
        </div>
        {!isLocked ? (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="text-white font-black text-sm px-6 py-2.5 bg-blue-600 rounded-xl active:scale-95 transition-all shadow-md shadow-blue-600/20"
          >
            {isSaving ? 'שומר...' : 'שמור טיוטה'}
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-xs font-black border border-emerald-100">
            <span className="material-symbols-outlined text-sm">verified</span>
            פעיל
          </div>
        )}
      </header>

      <main className="px-6 flex flex-col gap-8 mt-6">
        {/* Real-time Preview */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center px-1 flex-row-reverse">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest text-right">
              תצוגה מקדימה ללקוח
            </h3>
            {isLocked && (
              <span className="text-[10px] font-black text-amber-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">lock</span>
                כרטיס נעול לעריכה
              </span>
            )}
          </div>
          <div
            className={`bg-white rounded-[2.5rem] p-6 shadow-xl border border-gray-100 relative overflow-hidden transition-all text-right ${isLocked ? 'opacity-100 scale-100' : 'opacity-90'}`}
          >
            <div
              className={`absolute top-0 right-0 w-full h-2 ${brandColor} transition-colors`}
            ></div>
            <div className="flex items-center gap-4 mb-4 flex-row-reverse">
              <div className="size-14 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300 shrink-0">
                <span className="material-symbols-outlined text-3xl">
                  image
                </span>
              </div>
              <div>
                <h4 className="font-bold text-lg text-text-main leading-none">
                  {storeName}
                </h4>
                <p className="text-xs text-gray-400 mt-1">
                  צבור חתימות לקבלת {rewardText}
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap flex-row-reverse">
              {Array.from({ length: maxStamps }).map((_, i) => (
                <div
                  key={i}
                  className={`size-7 rounded-full flex items-center justify-center border-2 ${i < 3 ? `${brandColor} border-transparent text-white` : 'bg-gray-50 border-gray-100'}`}
                >
                  {i < 3 ? (
                    <span className="material-symbols-outlined text-[14px] font-bold">
                      check
                    </span>
                  ) : i === maxStamps - 1 ? (
                    <span className="material-symbols-outlined text-xs text-gray-300">
                      redeem
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Action Button: Lock */}
        {!isLocked && (
          <button
            onClick={() => setShowLockConfirm(true)}
            className="w-full bg-[#1a2e44] text-white font-black py-5 rounded-[2rem] shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined">lock_open</span>
            נעל והפעל כרטיסיה
          </button>
        )}

        {/* Store Profile Settings */}
        <section
          className={`bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50 flex flex-col gap-6 text-right transition-all ${isLocked ? 'opacity-70 pointer-events-none grayscale-[0.5]' : ''}`}
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700">
              שם העסק המופיע
            </label>
            <input
              type="text"
              value={storeName}
              disabled={isLocked}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full h-14 bg-gray-50 rounded-2xl border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-600 px-5 font-bold text-right"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700">
              תיאור ההטבה (למשל: קפה חינם)
            </label>
            <input
              type="text"
              value={rewardText}
              disabled={isLocked}
              onChange={(e) => setRewardText(e.target.value)}
              className="w-full h-14 bg-gray-50 rounded-2xl border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-600 px-5 font-bold text-right"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-gray-700">
              כמות ניקובים לכרטיס מלא:{' '}
              <span className="text-blue-600">{maxStamps}</span>
            </label>
            <input
              type="range"
              min="3"
              max="12"
              step="1"
              disabled={isLocked}
              value={maxStamps}
              onChange={(e) => setMaxStamps(parseInt(e.target.value))}
              className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600 my-4"
            />
          </div>
        </section>

        {/* Branding Color Picker */}
        <section
          className={`bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50 flex flex-col gap-4 text-right transition-all ${isLocked ? 'opacity-70 pointer-events-none grayscale-[0.5]' : ''}`}
        >
          <h3 className="font-bold text-text-main">מיתוג - צבע המותג</h3>
          <div className="grid grid-cols-3 gap-3">
            {colors.map((c) => (
              <button
                key={c.class}
                disabled={isLocked}
                onClick={() => setBrandColor(c.class)}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${brandColor === c.class ? 'border-blue-600 bg-blue-50 shadow-inner' : 'border-transparent bg-gray-50 opacity-60'}`}
              >
                <div
                  className={`size-8 rounded-full ${c.class} shadow-sm`}
                ></div>
                <span className="text-[10px] font-bold text-gray-500">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Create New Card Section - This appears after locking or for higher tiers */}
        <section className="flex flex-col gap-4">
          <div className="flex justify-between items-center px-1 flex-row-reverse">
            <h3 className="font-black text-text-main">ניהול קמפיינים נוספים</h3>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">
              מנוי {tier}
            </span>
          </div>

          <div
            onClick={() =>
              tier === 'starter'
                ? onNavigate('checkout')
                : alert('פותח מסך יצירה חדש...')
            }
            className={`bg-white p-8 rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center text-center gap-4 transition-all hover:scale-[1.01] cursor-pointer ${tier === 'starter' ? 'border-blue-100' : 'border-blue-300 bg-blue-50/20'}`}
          >
            <div className="size-16 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
              <span className="material-symbols-outlined text-4xl">add</span>
            </div>
            <div>
              <h5 className="font-black text-lg text-text-main">
                צור כרטיסיה חדשה
              </h5>
              <p className="text-sm text-gray-400 mt-1">
                מבצע עונתי, Happy Hour או מועדון משני
              </p>
            </div>

            {tier === 'starter' && (
              <div className="flex flex-col items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-600 bg-amber-50 px-4 py-1.5 rounded-full uppercase border border-amber-100">
                  <span className="material-symbols-outlined text-sm">
                    stars
                  </span>
                  שדרג ל-Pro כדי להוסיף כרטיסיות
                </div>
                <p className="text-[10px] text-gray-400">
                  במסלול ה-Starter ניתן לנהל כרטיסיה אחת בלבד
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Confirmation Modal for Locking */}
      {showLockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl flex flex-col gap-6 animate-in zoom-in duration-300">
            <div className="size-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-5xl">
                warning
              </span>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black text-text-main mb-2">
                נעילת כרטיסיה?
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                מרגע הנעילה לא ניתן יהיה לערוך את שם העסק, כמות הניקובים או
                הפרס. זאת כדי לשמור על אמינות מול הלקוחות שכבר החלו לצבור
                ניקובים.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmLock}
                className="w-full bg-[#1a2e44] text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all"
              >
                אני מבין, נעל והפעל
              </button>
              <button
                onClick={() => setShowLockConfirm(false)}
                className="w-full py-2 text-gray-400 font-bold text-sm"
              >
                חזור לעריכה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
