import { useEffect, useRef, useState } from 'react';
import { createWebReceiptAdapter } from '../../lib/scanner/webReceiptAdapter';
import {
  type CommandState,
  initialCommand,
  type Scope,
  WebScannerCommands,
} from '../../lib/web-scanner/command';
import {
  attachCameraLifecycle,
  WebQrController,
} from '../../lib/web-scanner/controller';
import { createFrameCapture } from '../../lib/web-scanner/decoder';
import { createHttpTransport } from '../../lib/web-scanner/httpTransport';
import { createRawWorkerDecoder } from '../../lib/web-scanner/rawWorker';
import { recoveryIdentity } from '../../lib/web-scanner/recovery';
import { initialScannerState } from '../../lib/web-scanner/state';

const labels: Record<CommandState['phase'], string> = {
  IDLE: 'המצלמה כבויה',
  CAMERA_READY: 'כוונו QR למצלמה',
  QR_LOCKED: 'הקוד נקרא',
  RESOLVING: 'בודקים את הקוד בשרת',
  READY_FOR_ACTION: 'בחרו פעולה',
  COMMITTING: 'הפעולה נשלחה — ממתינים לאישור',
  UNKNOWN_OUTCOME:
    'תוצאת הפעולה עדיין אינה ידועה. אין לסרוק או לבצע פעולה נוספת.',
  RECONCILING: 'מבררים את התוצאה בשרת',
  SUCCESS: 'השרת אישר את הפעולה',
  ERROR: 'הפעולה לא אושרה',
  OFFLINE: 'אין חיבור זמין — הפעולה לא נשלחה',
};
/** Instantiated only behind the Preview tester/business allowlists; Native never imports it. */
export default function BusinessScanner(props: {
  actorId: string;
  businessId: string;
  programId: string;
  token: string;
  url: string;
  enabled: boolean;
  canStartScan?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const current = useRef(props);
  current.current = props;
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<WebQrController | null>(null);
  const commands = useRef<WebScannerCommands | null>(null);
  const lockLease = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState(initialCommand);
  const [cameraState, setCameraState] = useState(initialScannerState);
  const [blocked, setBlocked] = useState<string | null>('מכינים סביבת בדיקה');
  const [benefits, setBenefits] = useState<
    Array<{ rewardId: string; title: string }>
  >([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const busy = [
      'QR_LOCKED',
      'RESOLVING',
      'COMMITTING',
      'UNKNOWN_OUTCOME',
      'RECONCILING',
    ].includes(state.phase);
    props.onBusy?.(busy);
    window.dispatchEvent(
      new CustomEvent('stampaix:scanner-busy', { detail: busy })
    );
  }, [state.phase, props.onBusy]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: an allowed reset deliberately recreates the runtime via revision.
  useEffect(() => {
    const element = video.current;
    if (!element || !props.enabled) return;
    let disposed = false;
    let releaseLock: (() => void) | undefined;
    let detachCamera: (() => void) | undefined;
    const onNetwork = () => commands.current?.networkChanged();
    const onPageHide = () => {
      camera.current?.stop();
      commands.current?.invalidate();
    };
    const onPageShow = () => {
      if (!disposed) commands.current?.networkChanged();
    };
    let qrReference: string | null = null;
    let recovery: ReturnType<typeof recoveryIdentity>;
    try {
      recovery = recoveryIdentity(
        sessionStorage,
        `stampaix:web-scanner-recovery:${props.actorId}:${props.businessId}:${props.programId}`
      );
      // Never reuse a resolve runtime after a completed/reset scan.
      if (!recovery.identity.uncertain) recovery.rotate();
    } catch {
      setBlocked('לא ניתן לשמור סימון אי־ודאות; הפעולות חסומות.');
      return;
    }
    if (!navigator.locks) {
      setBlocked('בדפדפן זה לא ניתן למנוע סריקה מקבילה; הפעולות חסומות.');
      return;
    }
    const scope: Scope = {
      actorId: props.actorId,
      businessId: props.businessId,
      programId: props.programId,
      runtimeId: recovery.identity.runtimeId,
      deviceId: recovery.identity.deviceId,
    };
    const valid = () =>
      !disposed &&
      current.current.enabled &&
      current.current.actorId === scope.actorId &&
      current.current.businessId === scope.businessId &&
      current.current.programId === scope.programId &&
      !!current.current.token;
    const createTransport =
      process.env.EXPO_PUBLIC_SCANNER_RECEIPTS === 'true'
        ? createWebReceiptAdapter
        : createHttpTransport;
    const transport = createTransport({
      url: props.url,
      token: () => current.current.token,
      online: () =>
        navigator.onLine !== false && document.visibilityState === 'visible',
      valid,
    });
    const previousLease = lockLease.current;
    lockLease.current = previousLease
      .then(async () => {
        // Cleanup resolves the previous lease; wait for the browser to release it before reset acquires again.
        if (disposed) return;
        await navigator.locks.request(
          `stampaix:web-scanner:${scope.actorId}:${scope.businessId}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock || disposed) {
              if (!disposed) setBlocked('סורק אחר פתוח עבור החשבון והעסק.');
              return;
            }
            setBlocked(null);
            const engine = new WebScannerCommands({
              scope,
              transport,
              online: () =>
                navigator.onLine !== false &&
                document.visibilityState === 'visible',
              current: valid,
              checkpoint: recovery.checkpoint,
              recovery: recovery.identity.uncertain,
              recoveredOperation:
                recovery.identity.operation && recovery.identity.operationId
                  ? {
                      operation: recovery.identity.operation,
                      operationId: recovery.identity.operationId,
                    }
                  : undefined,
              onState: (next) => {
                if (!disposed) setState(next);
              },
            });
            commands.current = engine;
            setState(engine.state);
            const makeDecoder = () =>
              createRawWorkerDecoder((value) => {
                qrReference = value;
              });
            const capture = new WebQrController({
              video: element,
              media: navigator.mediaDevices,
              secure: isSecureContext && location.protocol === 'https:',
              isVisible: () => document.visibilityState === 'visible',
              capture: createFrameCapture(element),
              createDecoder: makeDecoder,
              onState: (next) => {
                if (disposed) return;
                setCameraState(next);
                if (next.status === 'scanning') engine.cameraReady();
                if (next.status === 'locked' && qrReference) {
                  const data = qrReference;
                  qrReference = null;
                  if (current.current.canStartScan !== false)
                    void engine.decode(data);
                }
              },
            });
            camera.current = capture;
            detachCamera = attachCameraLifecycle(capture, document, window);
            window.addEventListener('online', onNetwork);
            window.addEventListener('offline', onNetwork);
            window.addEventListener('pagehide', onPageHide);
            window.addEventListener('pageshow', onPageShow);
            await new Promise<void>((resolve) => {
              releaseLock = resolve;
              if (disposed) resolve();
            });
          }
        );
      })
      .catch(() => {
        if (!disposed) setBlocked('נעילת הסורק לא זמינה; הפעולות חסומות.');
      });
    return () => {
      disposed = true;
      qrReference = null;
      detachCamera?.();
      camera.current?.destroy();
      camera.current = null;
      commands.current?.invalidate();
      commands.current = null;
      releaseLock?.();
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [
    props.actorId,
    props.businessId,
    props.programId,
    props.url,
    props.enabled,
    revision,
  ]);
  useEffect(() => {
    let cancelled = false;
    setBenefits([]);
    if (state.phase !== 'SUCCESS' || !state.session?.customerUserId) return;
    // Read only. No query error message is forwarded to logging/reporting.
    const fetchBenefits = async () => {
      try {
        const { ConvexHttpClient } = await import('convex/browser');
        const { makeFunctionReference } = await import('convex/server');
        const client = new ConvexHttpClient(props.url, {
          auth: props.token,
          logger: false,
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              cache: 'no-store',
              credentials: 'omit',
              redirect: 'error',
            }),
        });
        const rows = await client.query(
          makeFunctionReference<'query'>(
            'referrals:listCustomerAvailableReferralBenefits'
          ),
          {
            businessId: props.businessId,
            customerUserId: state.session?.customerUserId,
            limit: 12,
          }
        );
        client.clearAuth();
        if (!cancelled)
          setBenefits(
            rows.map((r: any) => ({
              rewardId: r.rewardId,
              title: r.benefitTitle ?? 'הטבת הפניה',
            }))
          );
      } catch {
        /* Read failure leaves no redeem buttons. */
      }
    };
    void fetchBenefits();
    return () => {
      cancelled = true;
    };
  }, [
    state.phase,
    state.session?.customerUserId,
    props.url,
    props.token,
    props.businessId,
  ]);
  const ready = state.phase === 'READY_FOR_ACTION';
  const success = state.phase === 'SUCCESS';
  const busy = [
    'QR_LOCKED',
    'RESOLVING',
    'COMMITTING',
    'UNKNOWN_OUTCOME',
    'RECONCILING',
  ].includes(state.phase);
  return (
    <main
      data-scanner-phase={state.phase}
      data-scanner-code={state.code ?? ''}
      dir="rtl"
      style={{
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: 16,
        boxSizing: 'border-box',
        fontFamily: 'sans-serif',
        color: '#172033',
      }}
    >
      <h1 style={{ textAlign: 'right' }}>{process.env.EXPO_PUBLIC_APP_ENV === 'preview' ? 'סורק עסקי — Preview למורשים בלבד' : 'סריקת QR'}</h1>
      {process.env.EXPO_PUBLIC_APP_ENV === 'preview' ? <p>בדיקה בסביבת Preview מבודדת. אין תוצאה מוצלחת לפני אישור מהשרת.</p> : null}
      {blocked ? <p role="alert">{blocked}</p> : null}
      <video
        ref={video}
        playsInline={true}
        muted={true}
        aria-label="מצלמה"
        style={{
          width: '100%',
          aspectRatio: '4/3',
          background: '#101828',
          borderRadius: 16,
        }}
      />
      <p aria-live="polite">{labels[state.phase]}</p>
      {state.code ? <p>{state.code}</p> : null}
      {['denied', 'no-camera', 'error', 'insecure', 'unsupported'].includes(
        cameraState.status
      ) ? (
        <p>
          המצלמה אינה זמינה ({cameraState.status}). בדקו הרשאה וחיבור HTTPS ונסו
          מחדש.
        </p>
      ) : null}
      {props.canStartScan === false ? (
        <p>הכרטיסייה אינה זמינה לסריקה חדשה. אפשר לברר תוצאה קודמת.</p>
      ) : null}
      {state.session ? <p>{state.session.customerDisplayName}</p> : null}
      {state.receipt && success ? (
        <p>
          אישור שרת:{' '}
          {state.receipt.eventType ?? state.receipt.status ?? 'הטבה מומשה'}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button
          type="button"
          disabled={
            props.canStartScan === false ||
            !!blocked ||
            busy ||
            ready ||
            success
          }
          onClick={() => void camera.current?.start()}
        >
          הפעלת מצלמה
        </button>
        {ready ? (
          <button
            type="button"
            onClick={() =>
              void commands.current?.action(
                state.session?.resolution === 'REDEEM_AVAILABLE'
                  ? 'redeem'
                  : 'stamp'
              )
            }
          >
            {state.session?.resolution === 'REDEEM_AVAILABLE'
              ? 'אישור מימוש'
              : 'אישור חותמת'}
          </button>
        ) : null}
        {success && state.receipt?.redemptionContinuationAvailableUntil ? (
          <button
            type="button"
            onClick={() => void commands.current?.action('continuation')}
          >
            מימוש הכרטיס שהושלם
          </button>
        ) : null}
        {success &&
        state.receipt?.undoAvailableUntil &&
        !state.receipt.undoBlockedReason ? (
          <button
            type="button"
            onClick={() => void commands.current?.action('undo')}
          >
            ביטול הפעולה
          </button>
        ) : null}
        {success
          ? benefits.map((benefit) => (
              <button
                type="button"
                key={benefit.rewardId}
                onClick={() =>
                  void commands.current?.action('referral', benefit.rewardId)
                }
              >
                {benefit.title}
              </button>
            ))
          : null}
        {state.phase === 'UNKNOWN_OUTCOME' ? (
          <button
            type="button"
            onClick={() => void commands.current?.reconcile()}
          >
            בירור תוצאה בלבד
          </button>
        ) : null}
        {state.phase === 'UNKNOWN_OUTCOME' &&
        ['stamp', 'redeem', 'continuation', 'undo'].includes(
          state.operation ?? ''
        ) ? (
          <button
            type="button"
            onClick={() => void commands.current?.retrySameSession()}
          >
            ניסיון מפורש באותה פעולה ובאותו מזהה
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || !!blocked}
          onClick={() => {
            if (commands.current?.reset()) {
              camera.current?.reset();
              setRevision((r) => r + 1);
            }
          }}
        >
          איפוס וסריקה חדשה
        </button>
      </div>
      {cameraState.cameras.length > 1 &&
      props.canStartScan !== false &&
      !busy &&
      !ready &&
      !success ? (
        <label>
          בחירת מצלמה{' '}
          <select
            value={cameraState.selectedCamera}
            onChange={(event) => void camera.current?.start(event.target.value)}
          >
            {cameraState.cameras.map((c) => (
              <option value={c.id} key={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {process.env.EXPO_PUBLIC_APP_ENV === 'preview' ? <p>תוכן QR עובר בזיכרון בלבד לצורך resolve. אין queue או retry אוטומטי של פעולה.</p> : null}
    </main>
  );
}
