import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import BusinessScanner from '@/components/web-scanner/BusinessScanner';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
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
      <main dir="rtl" style={{ padding: 16 }}>
        <p>הסורק לא זמין</p>
      </main>
    );
  if (recoveryUnavailable)
    return (
      <p role="alert" dir="rtl">
        נדרש בירור
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
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      {...(!scannerProgramId ? { role: 'main' } : {})}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: 0,
          font: '600 13px/1 Heebo, Arial, sans-serif',
        }}
      >
        כרטיסייה
        <select
          aria-label="כרטיסייה"
          style={{
            flex: 1,
            minHeight: 44,
            padding: '8px 12px',
            maxWidth: '100%',
            borderRadius: 12,
            border: '1px solid #D5DBE6',
          }}
          disabled={busy || !!priorProgram}
          value={scannerProgramId ?? ''}
          onChange={(event) =>
            setSelection({ scopeKey, programId: event.target.value })
          }
        >
          <option value="">בחרו כרטיס</option>
          {scannerProgramId &&
          !programs?.some(
            (p: any) => p.loyaltyProgramId === scannerProgramId
          ) ? (
            <option value={scannerProgramId}>בירור הפעולה הקודמת</option>
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
          canManageSubscription={
            activeBusiness?.capabilities?.manage_subscription === true
          }
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
