import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import BusinessScanner from '@/components/web-scanner/BusinessScanner';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { scannerPreviewEnabled } from '@/lib/web-scanner/previewGate';
import {
  retainRecoverySelection,
  selectedScannerProgram,
} from '@/lib/web-scanner/programSelection';
import { pendingProgram } from '@/lib/web-scanner/recovery';

export default function ScannerPreviewRoute() {
  const { user } = useUser();
  const token = useAuthToken();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const [selection, setSelection] = useState({ scopeKey: '', programId: '' });
  const scopeKey = `${user?._id ?? ''}:${activeBusinessId ?? ''}`;
  const [busy, setBusy] = useState(false);
  const url = process.env.EXPO_PUBLIC_CONVEX_URL_DEV ?? '';
  const enabled =
    !!token &&
    activeBusiness?.capabilities?.scanner_access === true &&
    scannerPreviewEnabled({
      platform: 'web',
      environment: process.env.EXPO_PUBLIC_APP_ENV,
      flag: process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS,
      actors: process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_ACTORS,
      businesses: process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_BUSINESSES,
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
        <p>
          בדיקת Phase 3 מיועדת למורשים בסביבת Preview מבודדת בלבד. Native נשאר
          זמין.
        </p>
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
    <div dir="rtl" {...(!scannerProgramId ? { role: 'main' } : {})}>
      {!scannerProgramId ? <h1>סריקת QR</h1> : null}
      <label>
        כרטיס לבדיקה{' '}
        <select
          disabled={busy || !!priorProgram}
          value={scannerProgramId ?? ''}
          onChange={(event) =>
            setSelection({ scopeKey, programId: event.target.value })
          }
        >
          <option value="">בחרו כרטיס</option>
          {priorProgram &&
          !programs?.some((p: any) => p.loyaltyProgramId === priorProgram) ? (
            <option value={priorProgram}>בירור הפעולה הקודמת</option>
          ) : null}
          {programs?.map((p: any) => (
            <option key={p.loyaltyProgramId} value={p.loyaltyProgramId}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      {scannerProgramId ? (
        <BusinessScanner
          key={`${user._id}:${activeBusinessId}:${scannerProgramId}`}
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
      ) : null}
    </div>
  );
}
