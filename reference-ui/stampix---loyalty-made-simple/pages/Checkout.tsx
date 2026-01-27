import React, { useState } from 'react';

interface Props {
  onBack: () => void;
  onSuccess: () => void;
}

export default function Checkout({ onBack, onSuccess }: Props) {
  const [step, setStep] = useState<'payment' | 'processing' | 'success'>(
    'payment'
  );
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const handleProcessPayment = () => {
    setStep('processing');
    setTimeout(() => {
      setStep('success');
    }, 3000);
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden animate-in slide-in-from-left duration-300">
      <header className="p-6 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-50">
        <button
          onClick={onBack}
          className="p-2 bg-gray-50 rounded-full flex items-center justify-center"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <h1 className="text-lg font-black text-text-main">סליקה מאובטחת</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pt-8 pb-10 flex flex-col">
        {step === 'payment' && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-bottom duration-500">
            <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-600/20 flex flex-col items-center text-center">
              <div className="size-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl">
                  verified_user
                </span>
              </div>
              <h2 className="text-2xl font-black">השלמת השדרוג</h2>
              <p className="text-blue-100/80 text-sm mt-1">
                אתה במרחק נגיעה מלוח בקרה עוצמתי
              </p>

              <div className="w-full h-px bg-white/10 my-6"></div>

              <div className="flex justify-between items-center w-full flex-row-reverse">
                <span className="font-bold opacity-70">סה"כ לתשלום</span>
                <span className="text-2xl font-black">₪99.00</span>
              </div>
            </div>

            <div className="flex flex-col gap-4 text-right">
              <h3 className="font-black text-text-main px-1 text-sm uppercase tracking-widest text-gray-400">
                פרטי כרטיס אשראי
              </h3>

              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="**** **** **** ****"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full h-16 bg-gray-50 rounded-2xl border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-600 px-5 pr-14 font-bold"
                  />
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">
                    credit_card
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 text-right">
                  <input
                    type="text"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full h-16 bg-gray-50 rounded-2xl border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-600 px-5 text-center font-bold"
                  />
                </div>
                <div className="flex flex-col gap-2 text-right">
                  <input
                    type="text"
                    placeholder="CVV"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    className="w-full h-16 bg-gray-50 rounded-2xl border-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-600 px-5 text-center font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              <button
                onClick={handleProcessPayment}
                className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">lock</span>
                בצע תשלום מאובטח
              </button>
              <div className="flex items-center justify-center gap-4 opacity-30 grayscale mt-2">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg"
                  className="h-4"
                  alt="visa"
                />
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                  className="h-6"
                  alt="mastercard"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-in fade-in duration-500">
            <div className="relative size-32">
              <div className="absolute inset-0 border-4 border-blue-50 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-4 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 text-4xl animate-pulse">
                  account_balance
                </span>
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black text-text-main mb-2">
                מעבד תשלום...
              </h3>
              <p className="text-gray-400">
                אנא המתן, אנחנו מאמתים את פרטי הכרטיס מול הבנק
              </p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-in zoom-in duration-500">
            <div className="size-32 bg-green-100 rounded-full flex items-center justify-center text-green-600 shadow-lg shadow-green-100/50">
              <span className="material-symbols-outlined text-7xl">
                verified
              </span>
            </div>
            <div className="text-center px-6">
              <h3 className="text-3xl font-black text-text-main mb-3">
                המנוי שודרג בהצלחה!
              </h3>
              <p className="text-gray-500 leading-relaxed">
                ברוך הבא למשפחת ה-Pro. <br />
                כל הפיצ'רים המתקדמים פתוחים כעת עבורך.
              </p>
            </div>
            <button
              onClick={onSuccess}
              className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all mt-4"
            >
              חזור לניהול העסק
            </button>
          </div>
        )}
      </main>

      {step === 'payment' && (
        <footer className="p-8 text-center bg-gray-50/50 border-t border-gray-50">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-[10px] font-bold mb-1">
            <span className="material-symbols-outlined text-sm">security</span>
            <span>תשלום מאובטח בתקן PCI-DSS</span>
          </div>
        </footer>
      )}
    </div>
  );
}
