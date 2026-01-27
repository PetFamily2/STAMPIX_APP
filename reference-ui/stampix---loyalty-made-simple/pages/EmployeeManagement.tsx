import React, { useState } from 'react';

interface Employee {
  id: string;
  name: string;
  role: string;
  avatar: string;
  permissions: {
    canScan: boolean;
    canViewStats: boolean;
    canEditRewards: boolean;
  };
  lastActivity: string;
  totalActions: number;
}

const MOCK_EMPLOYEES: Employee[] = [
  {
    id: 'e1',
    name: 'יוסי כהן',
    role: 'אחראי משמרת',
    avatar: 'https://picsum.photos/100/100?u=50',
    permissions: { canScan: true, canViewStats: true, canEditRewards: false },
    lastActivity: 'סרק לקוח לפני 5 דקות',
    totalActions: 142,
  },
  {
    id: 'e2',
    name: 'שירה לוי',
    role: 'בריסטה',
    avatar: 'https://picsum.photos/100/100?u=51',
    permissions: { canScan: true, canViewStats: false, canEditRewards: false },
    lastActivity: 'התחברה למשמרת ב-08:00',
    totalActions: 89,
  },
];

interface Props {
  onBack: () => void;
}

export default function EmployeeManagement({ onBack }: Props) {
  const [employees, setEmployees] = useState(MOCK_EMPLOYEES);
  const [activeTab, setActiveTab] = useState<'staff' | 'logs'>('staff');

  const togglePermission = (
    empId: string,
    permission: keyof Employee['permissions']
  ) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === empId) {
          return {
            ...emp,
            permissions: {
              ...emp.permissions,
              [permission]: !emp.permissions[permission],
            },
          };
        }
        return emp;
      })
    );
  };

  return (
    <div className="flex-1 flex flex-col pb-10 overflow-y-auto animate-in slide-in-from-left duration-300 bg-mint-bg">
      <header className="p-6 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 bg-white rounded-full shadow-sm flex items-center justify-center"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <h1 className="text-xl font-black text-text-main">
            ניהול צוות עובדים
          </h1>
        </div>
        <button className="size-10 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-md">
          <span className="material-symbols-outlined">person_add</span>
        </button>
      </header>

      <div className="px-6 mt-6">
        <div className="flex bg-gray-100/50 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
          >
            צוות פעיל
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'logs' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
          >
            יומן פעילות
          </button>
        </div>
      </div>

      <main className="px-6 mt-8 flex-1">
        {activeTab === 'staff' && (
          <div className="flex flex-col gap-6">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50 flex flex-col gap-6"
              >
                <div className="flex items-center justify-between flex-row-reverse">
                  <div className="flex items-center gap-4 flex-row-reverse text-right">
                    <img
                      src={emp.avatar}
                      className="size-14 rounded-2xl shadow-sm"
                      alt={emp.name}
                    />
                    <div>
                      <h3 className="font-black text-lg text-text-main leading-none">
                        {emp.name}
                      </h3>
                      <span className="text-xs text-blue-600 font-bold">
                        {emp.role}
                      </span>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-gray-300 font-black block uppercase">
                      פעולות סה"כ
                    </span>
                    <span className="text-lg font-black">
                      {emp.totalActions}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-gray-50 w-full"></div>

                <div className="flex flex-col gap-4 text-right">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    הרשאות גישה
                  </h4>
                  <div className="space-y-3">
                    {[
                      {
                        id: 'canScan',
                        label: 'רשאי לסרוק לקוחות',
                        icon: 'qr_code_scanner',
                      },
                      {
                        id: 'canViewStats',
                        label: 'צפייה בנתוני אנליטיקה',
                        icon: 'analytics',
                      },
                      {
                        id: 'canEditRewards',
                        label: 'ניהול והגדרת הטבות',
                        icon: 'settings_suggest',
                      },
                    ].map((perm) => (
                      <div
                        key={perm.id}
                        className="flex items-center justify-between flex-row-reverse"
                      >
                        <div className="flex items-center gap-3 flex-row-reverse">
                          <span className="material-symbols-outlined text-gray-400 text-xl">
                            {perm.icon}
                          </span>
                          <span className="text-sm font-bold text-gray-700">
                            {perm.label}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            togglePermission(emp.id, perm.id as any)
                          }
                          className={`w-10 h-5 rounded-full relative transition-colors ${emp.permissions[perm.id as keyof Employee['permissions']] ? 'bg-blue-600' : 'bg-gray-200'}`}
                        >
                          <div
                            className={`absolute top-0.5 size-4 bg-white rounded-full shadow-sm transition-transform ${emp.permissions[perm.id as keyof Employee['permissions']] ? 'translate-x-[-1.3rem]' : 'translate-x-[0.1rem]'}`}
                          ></div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-2xl flex items-center justify-between flex-row-reverse">
                  <div className="flex items-center gap-2 flex-row-reverse">
                    <span className="material-symbols-outlined text-blue-400 text-sm">
                      history
                    </span>
                    <span className="text-[10px] font-bold text-blue-600">
                      {emp.lastActivity}
                    </span>
                  </div>
                  <button className="text-[10px] font-black text-gray-400 hover:text-red-500 uppercase">
                    הסר מהצוות
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-50">
              <h3 className="font-black text-text-main mb-6 text-right">
                פעולות אחרונות במשמרת
              </h3>
              <div className="space-y-6">
                {[
                  {
                    emp: 'יוסי כהן',
                    action: 'סרק לקוח בהצלחה',
                    time: '14:22',
                    icon: 'check_circle',
                    color: 'text-green-500',
                  },
                  {
                    emp: 'יוסי כהן',
                    action: 'מימש הטבת קפה חינם',
                    time: '14:05',
                    icon: 'redeem',
                    color: 'text-blue-500',
                  },
                  {
                    emp: 'שירה לוי',
                    action: 'סרקה לקוח חדש',
                    time: '13:40',
                    icon: 'person_add',
                    color: 'text-purple-500',
                  },
                  {
                    emp: 'שירה לוי',
                    action: 'נסיונות סריקה כושלים',
                    time: '13:12',
                    icon: 'error',
                    color: 'text-amber-500',
                  },
                ].map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between flex-row-reverse border-b border-gray-50 pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 flex-row-reverse text-right">
                      <div
                        className={`size-8 rounded-lg bg-gray-50 flex items-center justify-center ${log.color}`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {log.icon}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-text-main leading-tight">
                          {log.action}
                        </p>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {log.emp}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-gray-300">
                      {log.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
