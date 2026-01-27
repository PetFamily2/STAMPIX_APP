import React, { useState } from 'react';
import { generateWinBackMessage } from '../services/geminiService';
import { CustomerActivity } from '../types';

interface Props {
  onBack: () => void;
}

const WEEKLY_DATA = [12, 18, 15, 24, 32, 28, 14];
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const ALL_CUSTOMERS = [
  {
    id: 'c1',
    name: 'ישראל ישראלי',
    phone: '050-1234567',
    currentPunches: 8,
    maxPunches: 10,
    lastVisit: 'היום',
    isVip: true,
    risk: false,
  },
  {
    id: 'c2',
    name: 'מיכל לוי',
    phone: '054-9876543',
    currentPunches: 3,
    maxPunches: 10,
    lastVisit: 'אתמול',
    isVip: true,
    risk: false,
  },
  {
    id: 'c3',
    name: 'דני כהן',
    phone: '052-1112223',
    currentPunches: 9,
    maxPunches: 10,
    lastVisit: 'לפני יומיים',
    isVip: false,
    risk: false,
  },
  {
    id: 'c4',
    name: 'נועה אברהם',
    phone: '050-5556667',
    currentPunches: 1,
    maxPunches: 10,
    lastVisit: 'לפני שבועיים',
    isVip: false,
    risk: true,
  },
  {
    id: 'c5',
    name: 'יוסי מזרחי',
    phone: '058-4443332',
    currentPunches: 5,
    maxPunches: 5,
    lastVisit: 'לפני חודש',
    isVip: false,
    risk: true,
  },
];

export default function MerchantAnalytics({ onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'customers'>(
    'overview'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeneratingMessage, setIsGeneratingMessage] = useState<string | null>(
    null
  ); // Stores customer ID being processed
  const [pendingMessage, setPendingMessage] = useState<{
    id: string;
    name: string;
    text: string;
  } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const maxWeekly = Math.max(...WEEKLY_DATA);
  const riskCount = ALL_CUSTOMERS.filter((c) => c.risk).length;

  const filteredCustomers = ALL_CUSTOMERS.filter(
    (c) => c.name.includes(searchQuery) || c.phone.includes(searchQuery)
  );

  const handleSendMessage = async (customer: any) => {
    setIsGeneratingMessage(customer.id);
    const msg = await generateWinBackMessage(customer.name, 'קפה ארומה');
    setPendingMessage({
      id: customer.id,
      name: customer.name,
      text: msg || '',
    });
    setIsGeneratingMessage(null);
  };

  const confirmSend = () => {
    setPendingMessage(null);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  return (
    <div className="flex-1 flex flex-col pb-10 overflow-y-auto animate-in slide-in-from-left duration-300">
      <header className="p-6 pb-2 flex flex-col gap-4 bg-white/70 backdrop-blur-md sticky top-0 z-30 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 bg-white rounded-full shadow-sm"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <h1 className="text-xl font-black text-text-main">
            מרכז ניהול ואנליטיקה
          </h1>
        </div>

        <div className="flex bg-gray-100/50 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'overview' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
          >
            סקירה כללית
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'customers' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
          >
            ניהול לקוחות
          </button>
        </div>
      </header>

      <main className="px-6 flex flex-col gap-8 mt-6">
        {activeTab === 'overview' ? (
          <>
            <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-50">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-text-main">ניקובים השבוע</h3>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    סה"כ: 171
                  </span>
                </div>
              </div>

              <div className="flex items-end justify-between h-40 gap-2 px-2">
                {WEEKLY_DATA.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-2 group"
                  >
                    <div
                      className={`w-full rounded-t-xl transition-all duration-700 relative ${i === 4 ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-blue-100'}`}
                      style={{ height: `${(val / maxWeekly) * 100}%` }}
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {val}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400">
                      {DAYS[i]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-50">
              <h3 className="font-black text-text-main mb-4">
                שעות עומס (ממוצע)
              </h3>
              <div className="grid grid-cols-6 gap-2">
                {[8, 10, 12, 14, 16, 18, 20, 22].map((hour, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-full h-8 rounded-lg ${hour === 16 || hour === 18 ? 'bg-blue-600' : hour === 12 ? 'bg-blue-400' : 'bg-blue-50'}`}
                    ></div>
                    <span className="text-[8px] font-bold text-gray-300">
                      {hour}:00
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-4">
              <div
                className="bg-blue-600 rounded-[2rem] p-5 text-white shadow-lg shadow-blue-600/20 relative overflow-hidden cursor-pointer"
                onClick={() => setActiveTab('customers')}
              >
                <div className="relative z-10">
                  <div className="size-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                    <span className="material-symbols-outlined text-white">
                      person_off
                    </span>
                  </div>
                  <span className="text-2xl font-black block">{riskCount}</span>
                  <span className="text-xs font-bold opacity-80">
                    לקוחות בסיכון
                  </span>
                </div>
                <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-7xl opacity-10">
                  warning
                </span>
              </div>
              <div className="bg-white rounded-[2rem] p-5 border border-gray-50 shadow-sm">
                <div className="size-10 bg-green-50 rounded-xl flex items-center justify-center mb-3 text-green-600">
                  <span className="material-symbols-outlined">trending_up</span>
                </div>
                <span className="text-2xl font-black block text-text-main">
                  +12%
                </span>
                <span className="text-xs font-bold text-gray-400">
                  צמיחה מחודש שעבר
                </span>
              </div>
            </div>

            <section className="bg-[#1a2e44] rounded-[2.5rem] p-6 text-white shadow-xl flex gap-4 relative overflow-hidden">
              <div className="size-12 bg-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 relative z-10">
                <span className="material-symbols-outlined text-white">
                  auto_awesome
                </span>
              </div>
              <div className="flex flex-col gap-1 relative z-10">
                <h4 className="font-black text-blue-400 text-sm uppercase tracking-widest">
                  תובנת בינה מלאכותית
                </h4>
                <p className="text-xs text-blue-50/80 leading-relaxed">
                  זיהינו ש-{riskCount} לקוחות לא ביקרו בעסק מעל שבועיים. שליחת
                  קופון "אנחנו מתגעגעים" עשויה להחזיר 40% מהם!
                </p>
              </div>
              <span className="material-symbols-outlined absolute -bottom-10 -right-10 text-[160px] opacity-5 rotate-12">
                tips_and_updates
              </span>
            </section>
          </>
        ) : (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Re-engagement Banner */}
            {riskCount > 0 && (
              <section className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex flex-col gap-4 shadow-sm animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="size-10 bg-amber-500 rounded-full flex items-center justify-center text-white shrink-0">
                    <span className="material-symbols-outlined">campaign</span>
                  </div>
                  <div>
                    <h4 className="font-black text-amber-900 leading-tight">
                      נמצאו {riskCount} לקוחות שלא ביקרו זמן רב
                    </h4>
                    <p className="text-xs text-amber-800/70 mt-1">
                      זה הזמן להחזיר אותם עם הודעה אישית והטבה!
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleSendMessage(ALL_CUSTOMERS.find((c) => c.risk))
                  }
                  className="bg-amber-500 text-white font-black py-3 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all text-sm"
                >
                  <span className="material-symbols-outlined text-sm">
                    auto_awesome
                  </span>
                  צור הודעת שימור ללקוחות בסיכון
                </button>
              </section>
            )}

            <div className="relative">
              <input
                type="text"
                placeholder="חפש לקוח לפי שם או טלפון..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 bg-white rounded-2xl border-none shadow-sm ring-1 ring-gray-100 pr-12 text-sm font-medium focus:ring-2 focus:ring-blue-500"
              />
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">
                search
              </span>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="font-black text-text-main">
                  כל הלקוחות ({filteredCustomers.length})
                </h3>
                <div className="flex gap-2">
                  <button className="size-8 bg-white border border-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-sm">
                      filter_list
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className={`bg-white p-5 rounded-[2rem] shadow-sm border flex flex-col gap-4 transition-all ${customer.risk ? 'border-amber-200 bg-amber-50/30' : 'border-gray-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`size-12 rounded-2xl flex items-center justify-center relative ${customer.risk ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}
                        >
                          <span className="material-symbols-outlined">
                            person
                          </span>
                          {customer.isVip && (
                            <div className="absolute -top-1 -right-1 size-5 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center">
                              <span className="material-symbols-outlined text-[10px] text-white">
                                star
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-main">
                              {customer.name}
                            </span>
                            {customer.risk && (
                              <span className="text-[9px] font-black text-white bg-amber-500 px-1.5 py-0.5 rounded uppercase">
                                בסיכון
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 font-medium">
                            {customer.phone}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col">
                        <span className="text-[10px] text-gray-300 font-bold uppercase tracking-tighter">
                          ביקור אחרון
                        </span>
                        <span
                          className={`text-xs font-bold ${customer.risk ? 'text-amber-600' : 'text-text-main'}`}
                        >
                          {customer.lastVisit}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                        <span>סטטוס כרטיס</span>
                        <span className="text-blue-600">
                          {customer.currentPunches} / {customer.maxPunches}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${customer.currentPunches === customer.maxPunches ? 'bg-green-500' : 'bg-blue-600'}`}
                          style={{
                            width: `${(customer.currentPunches / customer.maxPunches) * 100}%`,
                          }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button className="flex-1 bg-white text-text-main text-xs font-bold py-2.5 rounded-xl border border-gray-100 active:scale-95 transition-all">
                        היסטוריה
                      </button>
                      <button
                        onClick={() => handleSendMessage(customer)}
                        disabled={isGeneratingMessage === customer.id}
                        className={`flex-1 text-xs font-bold py-2.5 rounded-xl border transition-all flex items-center justify-center gap-2 ${customer.risk ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-blue-50 text-blue-600 border-blue-100'}`}
                      >
                        {isGeneratingMessage === customer.id ? (
                          <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-sm">
                              {customer.risk ? 'auto_awesome' : 'send'}
                            </span>
                            {customer.risk ? 'החזר לקוח עם AI' : 'שלח הודעה'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Message Preview Modal */}
      {pendingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl flex flex-col gap-6 animate-in zoom-in duration-300">
            <div className="flex items-center gap-3">
              <div className="size-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined">auto_awesome</span>
              </div>
              <h3 className="text-xl font-black text-text-main">
                הודעת שימור מוכנה!
              </h3>
            </div>

            <div className="bg-gray-50 p-5 rounded-3xl border border-gray-100 text-sm leading-relaxed text-gray-700 italic relative">
              <span className="material-symbols-outlined absolute -top-3 -right-2 text-blue-200 text-4xl opacity-50">
                format_quote
              </span>
              "{pendingMessage.text}"
            </div>

            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
              ההודעה תישלח ל-{pendingMessage.name}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={confirmSend}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined">send</span>
                אשר ושלח עכשיו
              </button>
              <button
                onClick={() => setPendingMessage(null)}
                className="text-gray-400 font-bold py-2 text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-500">
          <span className="material-symbols-outlined">check_circle</span>
          <span className="font-bold">ההודעה נשלחה בהצלחה!</span>
        </div>
      )}
    </div>
  );
}
