import React, { useState } from 'react';
import type { MerchantStatus } from '../types';

const MOCK_MERCHANTS: MerchantStatus[] = [
  {
    id: 'm1',
    name: 'קפה ארומה',
    category: 'קפה',
    revenue: '₪12,400',
    status: 'active',
    logo: 'https://picsum.photos/100/100?u=10',
    customers: 450,
    punches: 1200,
    tier: 'Pro',
    lastBillDate: '01/03/24',
    registrationDate: '15/12/2023',
    credits: 50,
    ownerEmail: 'manager@aroma-tlv.co.il',
    notes: 'לקוח VIP, דורש מענה מהיר.',
    toolUsage: { aiVideos: 4, marketingMessages: 124, scansPerMonth: 850 },
  },
  {
    id: 'm2',
    name: 'פיצה פאמיליה',
    category: 'אוכל',
    revenue: '₪8,200',
    status: 'stuck',
    logo: 'https://picsum.photos/100/100?u=11',
    customers: 210,
    punches: 840,
    tier: 'Starter',
    lastBillDate: '05/03/24',
    registrationDate: '02/02/2024',
    credits: 0,
    ownerEmail: 'pizzahouse@gmail.com',
    notes: 'בעיה בסנכרון מול הקופה.',
    toolUsage: { aiVideos: 0, marketingMessages: 12, scansPerMonth: 120 },
  },
  {
    id: 'm3',
    name: 'גולדה',
    category: 'גלידה',
    revenue: '₪19,000',
    status: 'pending',
    logo: 'https://picsum.photos/100/100?u=13',
    customers: 890,
    punches: 3200,
    tier: 'Unlimited',
    lastBillDate: '20/02/24',
    registrationDate: '10/01/2024',
    credits: 200,
    ownerEmail: 'office@golda-global.com',
    notes: 'סניף הדגל בירושלים.',
    toolUsage: { aiVideos: 12, marketingMessages: 890, scansPerMonth: 2400 },
  },
];

interface Props {
  onNavigate: (page: any) => void;
}

export default function SuperAdminDashboard({ onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<'stats' | 'merchants'>('stats');
  const [inspectedMerchant, setInspectedMerchant] =
    useState<MerchantStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);

  const filteredMerchants = MOCK_MERCHANTS.filter(
    (m) => m.name.includes(searchQuery) || m.ownerEmail.includes(searchQuery)
  );

  const triggerAction = (label: string) => {
    setActionLoading(label);
    setTimeout(() => {
      setActionLoading(null);
      setShowToast(`הפעולה "${label}" בוצעה בהצלחה`);
      setTimeout(() => setShowToast(null), 3000);
    }, 1500);
  };

  const FeatureSuggestionCard = ({ title, icon, color }: any) => (
    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-col gap-3 group hover:bg-white/10 transition-all cursor-pointer">
      <div
        className={`size-10 rounded-xl flex items-center justify-center ${color}`}
      >
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <h5 className="text-xs font-black text-white mb-1">{title}</h5>
        <p className="text-[10px] text-gray-500 font-bold leading-tight">
          שלח הודעת הדרכה על השימוש בפיצ'ר זה
        </p>
      </div>
      <button
        onClick={() => triggerAction(`שליחת פיצ'ר: ${title}`)}
        className="mt-auto text-[9px] font-black uppercase tracking-widest text-blue-400 group-hover:text-blue-300 transition-colors"
      >
        שלח הודעה
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f1a] text-white animate-in fade-in duration-500 font-sans pb-10">
      {/* Unified Header */}
      <header className="p-6 bg-[#111827]/80 backdrop-blur-xl sticky top-0 z-40 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {inspectedMerchant ? (
            <button
              onClick={() => setInspectedMerchant(null)}
              className="size-10 bg-white/5 rounded-full flex items-center justify-center text-blue-400"
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          ) : (
            <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              <span className="material-symbols-outlined text-white">
                shield_person
              </span>
            </div>
          )}
          <div className="text-right">
            <h1 className="font-black text-base tracking-tight">
              {inspectedMerchant ? inspectedMerchant.name : 'STAMPIX OS Admin'}
            </h1>
            <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">
              {inspectedMerchant
                ? `Internal ID: ${inspectedMerchant.id}`
                : 'Super User Management'}
            </span>
          </div>
        </div>
        {!inspectedMerchant && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('stats')}
              className={`size-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'stats' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400'}`}
            >
              <span className="material-symbols-outlined">analytics</span>
            </button>
            <button
              onClick={() => setActiveTab('merchants')}
              className={`size-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'merchants' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400'}`}
            >
              <span className="material-symbols-outlined">storefront</span>
            </button>
          </div>
        )}
        <button
          onClick={() => onNavigate('splash')}
          className="size-10 bg-rose-500/10 text-rose-500 rounded-xl flex items-center justify-center"
        >
          <span className="material-symbols-outlined">logout</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
            <span className="material-symbols-outlined">check_circle</span>
            <span className="text-sm font-bold">{showToast}</span>
          </div>
        )}

        {!inspectedMerchant ? (
          <>
            {activeTab === 'stats' ? (
              <div className="flex flex-col gap-6 animate-in slide-in-from-bottom duration-500">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#111827] p-5 rounded-[2rem] border border-white/5">
                    <span className="text-gray-500 text-[9px] font-black uppercase block mb-1">
                      מחזור עסקאות
                    </span>
                    <span className="text-3xl font-black text-emerald-400">
                      ₪342,800
                    </span>
                  </div>
                  <div className="bg-[#111827] p-5 rounded-[2rem] border border-white/5">
                    <span className="text-gray-500 text-[9px] font-black uppercase block mb-1">
                      ניקובים היום
                    </span>
                    <span className="text-3xl font-black text-blue-500">
                      1,240
                    </span>
                  </div>
                </div>

                <section className="bg-[#111827] p-6 rounded-[2.5rem] border border-white/5">
                  <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest mb-6 text-right">
                    התראות מערכת דחופות
                  </h3>
                  <div className="space-y-4">
                    <div className="flex flex-row-reverse items-center justify-between bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10">
                      <div className="flex flex-row-reverse items-center gap-3">
                        <div className="size-8 bg-rose-500 rounded-lg flex items-center justify-center text-white">
                          <span className="material-symbols-outlined text-sm">
                            warning
                          </span>
                        </div>
                        <div className="text-right">
                          <h4 className="text-sm font-bold">
                            פיצה פאמיליה - חיוב נכשל
                          </h4>
                          <p className="text-[10px] text-rose-500 font-medium">
                            כרטיס האשראי פג תוקף
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setInspectedMerchant(MOCK_MERCHANTS[1])}
                        className="text-[10px] font-black underline"
                      >
                        טפל עכשיו
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-in slide-in-from-right duration-500">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="חפש לפי שם עסק, אימייל או ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-14 bg-white/5 rounded-2xl border-none ring-1 ring-white/10 px-12 text-sm font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                  />
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                    search
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {filteredMerchants.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setInspectedMerchant(m)}
                      className="bg-[#111827] p-5 rounded-[2.5rem] border border-white/5 flex flex-row-reverse items-center justify-between group cursor-pointer hover:border-blue-500/30 transition-all"
                    >
                      <div className="flex flex-row-reverse items-center gap-4 text-right">
                        <img
                          src={m.logo}
                          className="size-14 rounded-2xl border border-white/10"
                          alt={m.name}
                        />
                        <div>
                          <h4 className="font-black text-lg">{m.name}</h4>
                          <span className="text-[10px] text-gray-500 font-bold">
                            {m.tier} • {m.category}
                          </span>
                        </div>
                      </div>
                      <div className="text-left">
                        <span className="text-emerald-400 font-black block">
                          {m.revenue}
                        </span>
                        <span className="text-[9px] text-gray-600 font-bold">
                          {m.punches} ניקובים
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Merchant Deep Inspection View */
          <div className="flex flex-col gap-6 animate-in zoom-in duration-300">
            {/* Section 1: Business Overview & Notes */}
            <section className="bg-gradient-to-br from-[#111827] to-[#1a2e44] p-8 rounded-[3rem] border border-white/10">
              <div className="flex flex-col items-center text-center">
                <img
                  src={inspectedMerchant.logo}
                  className="size-20 rounded-[2rem] shadow-2xl mb-4 border-2 border-blue-500"
                />
                <h2 className="text-2xl font-black">
                  {inspectedMerchant.name}
                </h2>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                  חבר מועדון מ: {inspectedMerchant.registrationDate}
                </p>

                <div className="mt-6 w-full flex flex-col gap-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-right px-4">
                    הערות פנימיות (אדמין)
                  </label>
                  <textarea
                    className="w-full bg-black/40 rounded-2xl border border-white/5 p-4 text-sm font-medium text-right resize-none focus:ring-1 focus:ring-blue-500 h-24"
                    placeholder="הוסף הערה..."
                    defaultValue={inspectedMerchant.notes}
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Quick Support Actions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#111827] p-6 rounded-[2.5rem] border border-white/5 flex flex-col gap-4">
                <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest text-right">
                  אבטחה וגישה
                </h3>
                <button
                  onClick={() => triggerAction('איפוס סיסמא לבעלים')}
                  className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">
                    lock_reset
                  </span>
                  איפוס סיסמא לבעלים
                </button>
                <button
                  onClick={() => triggerAction('איפוס סיסמא לעובד')}
                  className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">
                    badge
                  </span>
                  איפוס סיסמא לעובד
                </button>
              </div>

              <div className="bg-[#111827] p-6 rounded-[2.5rem] border border-white/5 flex flex-col gap-4">
                <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest text-right">
                  פיננסים וחיוב
                </h3>
                <button
                  onClick={() => triggerAction('שינוי אמצעי תשלום')}
                  className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 py-3 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-emerald-500/20"
                >
                  <span className="material-symbols-outlined text-sm">
                    credit_card
                  </span>
                  שינוי פרטי אשראי
                </button>
                <button
                  onClick={() => triggerAction('הפקת דוח תשלומים')}
                  className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">
                    description
                  </span>
                  דוח תשלומים
                </button>
              </div>
            </div>

            {/* Section 3: System Credits & Benefits */}
            <section className="bg-[#111827] p-6 rounded-[2.5rem] border border-white/5">
              <div className="flex flex-row-reverse items-center justify-between mb-6">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                  זיכויים והטבות מערכת
                </h3>
                <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                  Balance: ₪{inspectedMerchant.credits}
                </span>
              </div>
              <div className="flex gap-3 flex-row-reverse">
                <button
                  onClick={() => triggerAction('הוספת זיכוי ₪50')}
                  className="flex-1 bg-white/5 border border-white/10 py-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all"
                >
                  <span className="material-symbols-outlined text-blue-400">
                    add_card
                  </span>
                  <span className="text-[10px] font-black">
                    הוסף זיכוי כספי
                  </span>
                </button>
                <button
                  onClick={() => triggerAction('הוספת חודש Pro חינם')}
                  className="flex-1 bg-white/5 border border-white/10 py-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-amber-600/10 hover:border-amber-500/30 transition-all"
                >
                  <span className="material-symbols-outlined text-amber-400">
                    verified
                  </span>
                  <span className="text-[10px] font-black">הענק חודש מתנה</span>
                </button>
              </div>
            </section>

            {/* Section 4: Tool Usage & Marketing Uplift */}
            <section className="bg-[#111827] p-6 rounded-[2.5rem] border border-white/5">
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest text-right mb-6">
                ניצול כלי האפליקציה
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="text-center">
                  <span className="text-lg font-black block">
                    {inspectedMerchant.toolUsage.aiVideos}
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold">
                    סרטוני AI
                  </span>
                </div>
                <div className="text-center border-x border-white/5">
                  <span className="text-lg font-black block">
                    {inspectedMerchant.toolUsage.marketingMessages}
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold">
                    הודעות שיווק
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-lg font-black block">
                    {inspectedMerchant.toolUsage.scansPerMonth}
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold">
                    סריקות/חודש
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                  הצעות פיצ'רים לשליחה (Uplift)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <FeatureSuggestionCard
                    title="יצירת וידאו AI"
                    icon="movie_edit"
                    color="bg-blue-500/20 text-blue-400"
                  />
                  <FeatureSuggestionCard
                    title="שימור לקוחות"
                    icon="auto_awesome"
                    color="bg-amber-500/20 text-amber-400"
                  />
                  <FeatureSuggestionCard
                    title="ניהול צוות"
                    icon="badge"
                    color="bg-emerald-500/20 text-emerald-400"
                  />
                  <FeatureSuggestionCard
                    title="אנליטיקה"
                    icon="monitoring"
                    color="bg-purple-500/20 text-purple-400"
                  />
                </div>
              </div>
            </section>

            {/* Final Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => triggerAction('שיחת תמיכה יזומה')}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined">support_agent</span>
                שלח הודעת תמיכה אישית
              </button>
              <button
                onClick={() => triggerAction('השעיית חשבון')}
                className="w-full bg-white/5 text-rose-500 font-black py-4 rounded-2xl flex items-center justify-center gap-2 border border-rose-500/10"
              >
                <span className="material-symbols-outlined">block</span>
                השעיית גישה למערכת
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Persistent Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#111827]/90 backdrop-blur-md px-6 py-4 border-t border-white/5 flex justify-between items-center z-40">
        <div className="flex items-center gap-2">
          <div className="size-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">
            Active Admin Session
          </span>
        </div>
        <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest">
          {inspectedMerchant
            ? `Managing: ${inspectedMerchant.name}`
            : 'Stampix Platform v3.0'}
        </div>
      </footer>
    </div>
  );
}
