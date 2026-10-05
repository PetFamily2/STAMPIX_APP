import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import BusinessScanner from '@/components/web-scanner/BusinessScanner';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { scannerPreviewEnabled } from '@/lib/web-scanner/previewGate';

export default function ScannerPreviewRoute() {
  const { user } = useUser();
  const token = useAuthToken();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const [selected, setSelected] = useState('');
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
      prodUrl: process.env.EXPO_PUBLIC_CONVEX_URL_PROD,
    });
  const programs = useQuery(
    api.loyaltyPrograms.listScannerPrograms,
    enabled && activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  if (!enabled || !user || !activeBusinessId || !token)
    return (
      <div dir="rtl" style={{ padding: 24 }}>
        <h1>סורק Web עדיין אינו זמין</h1>
        <p>
          בדיקת Phase 3 מיועדת למורשים בסביבת Preview מבודדת בלבד. Native נשאר
          זמין.
        </p>
      </div>
    );
  const program = programs?.find((p: any) => p.loyaltyProgramId === selected);
  return (
    <div dir="rtl">
      <label>
        כרטיס לבדיקה{' '}
        <select
          disabled={busy}
          value={program ? selected : ''}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">בחרו כרטיס</option>
          {programs?.map((p: any) => (
            <option key={p.loyaltyProgramId} value={p.loyaltyProgramId}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      {program ? (
        <BusinessScanner
          key={`${user._id}:${activeBusinessId}:${selected}`}
          actorId={user._id}
          businessId={activeBusinessId}
          programId={selected}
          token={token}
          url={url}
          enabled={enabled}
          onBusy={setBusy}
        />
      ) : null}
    </div>
  );
}
