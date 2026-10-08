import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { ConvexHttpClient } from 'convex/browser';
import { useConvex } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { type ManualQaRole } from '@/lib/auth/manualQaPolicy';
import {
  manualQaAccessReference,
  useManualQaAccess,
} from '@/lib/auth/useManualQaAccess';

const roles: Array<{ role: ManualQaRole; label: string; detail: string }> = [
  {
    role: 'customer',
    label: 'כניסה כלקוח',
    detail: 'ארנק, כרטיסיות, QR, הטבות והודעות',
  },
  {
    role: 'owner',
    label: 'כניסה כבעל עסק',
    detail: 'לקוחות, כרטיסיות, קמפיינים והגדרות העסק',
  },
  {
    role: 'manager',
    label: 'כניסה כמנהל',
    detail: 'ניהול העסק בהתאם להרשאות מנהל',
  },
  {
    role: 'staff',
    label: 'כניסה כעובד',
    detail: 'סורק והגדרות צוות, ללא הרשאות בעלים',
  },
];

export default function ManualPreviewQa() {
  const { signIn, signOut } = useAuthActions();
  const token = useAuthToken();
  const { user } = useUser();
  const convex = useConvex();
  const router = useRouter();
  const { enabled, access } = useManualQaAccess();
  const [pending, setPending] = useState<ManualQaRole | null>(null);
  const [error, setError] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [signedInRole, setSignedInRole] = useState<ManualQaRole | null>(null);
  useEffect(() => {
    const account = access?.accounts.find(
      (value) => value.role === signedInRole
    );
    if (!signedInRole || !token || !account || user?._id !== account.userId)
      return;
    let cancelled = false;
    const route = async () => {
      try {
        if (
          onboarding &&
          (signedInRole === 'customer' || signedInRole === 'owner')
        ) {
          const client = new ConvexHttpClient(access!.backendUrl, {
            auth: token,
            logger: false,
          });
          await client.mutation(
            makeFunctionReference<'mutation'>('manualQa:restartOnboarding'),
            {},
            { skipQueue: true }
          );
          if (!cancelled) router.replace('/(auth)/name-capture');
        } else if (!cancelled) {
          router.replace(
            signedInRole === 'customer'
              ? '/(authenticated)/(customer)/wallet'
              : signedInRole === 'staff'
                ? '/staff'
                : '/business'
          );
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setPending(null);
          setSignedInRole(null);
        }
      }
    };
    void route();
    return () => {
      cancelled = true;
    };
  }, [signedInRole, token, user?._id, access, onboarding, router]);
  const login = async (role: ManualQaRole) => {
    if (!enabled || !access || pending) return;
    setPending(role);
    setSignedInRole(null);
    setError(false);
    try {
      // Re-read server authorization immediately before using synthetic credentials.
      const fresh = await convex.query(manualQaAccessReference, {});
      const account = fresh?.accounts.find((value) => value.role === role);
      if (
        !fresh ||
        !account ||
        fresh.backendUrl !== process.env.EXPO_PUBLIC_MANUAL_QA_PREVIEW_URL
      )
        throw new Error('MANUAL_QA_DISABLED');
      if (token) await signOut();
      const result = await signIn('password', {
        flow: 'signIn',
        email: account.email,
        password: fresh.password,
      });
      if (!result.signingIn) throw new Error('MANUAL_QA_LOGIN_FAILED');
      setSignedInRole(role);
    } catch {
      setError(true);
      setPending(null);
    }
  };
  return (
    <main
      dir="rtl"
      style={{
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: 'Heebo, Arial, sans-serif',
        color: '#172033',
        textAlign: 'right',
      }}
    >
      <h1>כניסה לבדיקות</h1>
      <p>StampAix Preview — חשבונות ונתונים סינתטיים בלבד.</p>
      {!enabled || access === null ? (
        <p role="alert">כניסה לבדיקות אינה זמינה בסביבה הזאת.</p>
      ) : (
        <>
          <p>
            בחרו תפקיד כדי להיכנס ולבדוק את האפליקציה. אפשר לחזור למסך הזה
            ולהחליף תפקיד.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {roles.map(({ role, label, detail }) => (
              <button
                key={role}
                type="button"
                disabled={!access || pending !== null}
                onClick={() => void login(role)}
                style={{
                  minHeight: 72,
                  padding: '16px 20px',
                  borderRadius: 16,
                  border: '2px solid #2459c5',
                  background: '#2459c5',
                  color: '#fff',
                  font: 'inherit',
                  textAlign: 'right',
                  cursor: 'pointer',
                }}
              >
                <strong style={{ display: 'block', fontSize: 18 }}>
                  {label}
                </strong>
                <span style={{ display: 'block', marginTop: 4, fontSize: 14 }}>
                  {detail}
                </span>
              </button>
            ))}
          </div>
          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              minHeight: 48,
              marginTop: 16,
            }}
          >
            <input
              type="checkbox"
              checked={onboarding}
              disabled={pending !== null}
              onChange={(event) => setOnboarding(event.target.checked)}
            />
            התחלה ב־onboarding (לקוח ובעל עסק)
          </label>
          <p aria-live="polite">
            {pending
              ? 'מתחברים לחשבון הבדיקה…'
              : access === undefined
                ? 'בודקים זמינות…'
                : ''}
          </p>
        </>
      )}
      {error ? (
        <p role="alert">הכניסה לא הושלמה. בדקו חיבור ונסו שוב.</p>
      ) : null}
      <a
        href="/welcome"
        style={{
          color: '#2459c5',
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 44,
        }}
      >
        חזרה למסך הפתיחה
      </a>
    </main>
  );
}
