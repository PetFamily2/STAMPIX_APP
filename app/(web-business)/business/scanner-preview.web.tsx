import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import BusinessScanner from '@/components/web-scanner/BusinessScanner';
import { ScannerProgramTiles } from '@/components/web-scanner/ScannerProgramTiles.web';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { scannerCommandsEnabled } from '@/lib/web-scanner/previewGate';
import {
  retainRecoverySelection,
  selectedScannerProgram,
} from '@/lib/web-scanner/programSelection';
import { pendingProgram } from '@/lib/web-scanner/recovery';
import { getConvexUrl } from '@/utils/convexConfig';

export default function ScannerPreviewRoute() {
  const { user } = useUser();
  const token = useAuthToken();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const [selection, setSelection] = useState({ scopeKey: '', programId: '' });
  const scopeKey = `${user?._id ?? ''}:${activeBusinessId ?? ''}`;
  const [busy, setBusy] = useState(false);
  const preview = process.env.EXPO_PUBLIC_APP_ENV === 'preview';
  const url = getConvexUrl();
  const enabled =
    !!token &&
    activeBusiness?.capabilities?.scanner_access === true &&
    scannerCommandsEnabled({
      platform: 'web',
      environment: process.env.EXPO_PUBLIC_APP_ENV,
      flag: process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS,
      productPreview: process.env.EXPO_PUBLIC_WEB_SCANNER_PRODUCT_PREVIEW,
      sharedBackend: process.env.EXPO_PUBLIC_STAMPAIX_SHARED_BACKEND,
      releaseGate: process.env.EXPO_PUBLIC_PWA_RELEASE_GATE,
      actors: preview
        ? process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_ACTORS
        : process.env.EXPO_PUBLIC_WEB_SCANNER_PILOT_ACTORS,
      businesses: preview
        ? process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_BUSINESSES
        : process.env.EXPO_PUBLIC_WEB_SCANNER_PILOT_BUSINESSES,
      backend: process.env.EXPO_PUBLIC_WEB_SCANNER_BACKEND,
      actorId: user?._id,
      businessId: activeBusinessId ?? undefined,
      url,
      previewUrl: process.env.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL,
      prodUrl: process.env.EXPO_PUBLIC_CONVEX_URL_PROD,
    });
  const programs = useQuery(
    api.loyaltyPrograms.listScannerPrograms,
    enabled && activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  let priorProgram: string | null = null;
  let recoveryUnavailable = false;
  try {
    if (enabled && user && activeBusinessId)
      priorProgram = pendingProgram(
        sessionStorage,
        String(user._id),
        String(activeBusinessId)
      );
  } catch {
    recoveryUnavailable = true;
  }
  useEffect(() => {
    if (priorProgram)
      setSelection((previous) =>
        retainRecoverySelection(previous, scopeKey, priorProgram)
      );
  }, [scopeKey, priorProgram]);
  if (!enabled || !user || !activeBusinessId || !token)
    return (
      <main dir="rtl" style={{ padding: 24 }}>
        <h1>סורק Web עדיין אינו זמין</h1>
        <p>אפשר להמשיך לסרוק באפליקציה.</p>
      </main>
    );
  if (recoveryUnavailable)
    return (
      <p role="alert" dir="rtl">
        סימון פעולה קודמת דורש בירור. הסורק חסום.
      </p>
    );
  const scannerProgramId = selectedScannerProgram(
    selection,
    scopeKey,
    priorProgram,
    (programs ?? []).map((p: any) => p.loyaltyProgramId)
  );
  return (
    <div
      dir="rtl"
      style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}
      {...(!scannerProgramId ? { role: 'main' } : {})}
    >
      <h1
        style={{
          margin: '0 0 8px',
          fontSize: 22,
          color: TOKENS.colors.textPrimary,
        }}
      >
        סריקת לקוח
      </h1>
      <p style={{ margin: '0 0 20px', color: TOKENS.colors.textSecondary }}>
        בחרו כרטיסייה והציגו למצלמה את קוד הלקוח.
      </p>
      <ScannerProgramTiles
        programs={programs ?? []}
        selectedId={scannerProgramId}
        disabled={busy || !!priorProgram}
        recoveryId={priorProgram ?? scannerProgramId}
        onSelect={(programId) => setSelection({ scopeKey, programId })}
      />
      {scannerProgramId ? (
        <BusinessScanner
          key={`${user._id}:${activeBusinessId}`}
          actorId={user._id}
          businessId={activeBusinessId}
          programId={scannerProgramId}
          token={token}
          url={url}
          enabled={enabled}
          canStartScan={
            programs?.some(
              (p: any) => p.loyaltyProgramId === scannerProgramId
            ) === true
          }
          onBusy={setBusy}
        />
      ) : (
        <section
          aria-live="polite"
          style={{
            marginTop: 16,
            padding: 24,
            borderRadius: TOKENS.radii.lg,
            background: TOKENS.colors.elevatedSurface,
            color: TOKENS.colors.textSecondary,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              margin: '0 0 8px',
              color: TOKENS.colors.textPrimary,
            }}
          >
            {programs === undefined
              ? 'טוענים כרטיסיות…'
              : programs.length === 0
                ? 'אין כרטיסיות זמינות לסריקה'
                : 'מתחילים בבחירת כרטיסייה'}
          </h2>
          <p style={{ margin: 0 }}>
            {programs?.length === 0
              ? 'כרטיסיות פעילות יופיעו כאן לאחר יצירתן במועדון.'
              : 'לחצו על כרטיסייה. אם הרשאת המצלמה שמורה בדפדפן, הסריקה תיפתח אוטומטית. כל חותמת או מימוש ידרשו אישור שלכם.'}
          </p>
        </section>
      )}
    </div>
  );
}
