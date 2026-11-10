import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { createWebReceiptAdapter } from '../../lib/scanner/webReceiptAdapter';
import {
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
import {
  cameraStatusLabel,
  scannerErrorLabel,
  scannerNeedsSubscription,
  scannerPhaseLabel,
} from '../../lib/web-scanner/userMessage';

/** Web camera and commands use normal Convex Auth and server business permissions. */
export default function BusinessScanner(props: {
  actorId: string;
  businessId: string;
  programId: string;
  token: string;
  url: string;
  enabled: boolean;
  canStartScan?: boolean;
  canManageSubscription?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const current = useRef(props);
  current.current = props;
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<WebQrController | null>(null);
  const commands = useRef<WebScannerCommands | null>(null);
  const lockLease = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState(initialCommand);
  const [cameraState, setCameraState] = useState(initialScannerState);
  const [blocked, setBlocked] = useState<string | null>('מכינים');
  const [benefits, setBenefits] = useState<
    Array<{ rewardId: string; title: string }>
  >([]);
  const [revision, setRevision] = useState(0);
  const [armed, setArmed] = useState<{
    phase: typeof state.phase;
    action: string;
  } | null>(null);
  const isArmed = (action: string) =>
    armed?.phase === state.phase && armed.action === action;
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
      camera.current?.suspend();
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
      setBlocked('אי אפשר לסרוק');
      return;
    }
    if (!navigator.locks) {
      setBlocked('אי אפשר לסרוק');
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
              if (!disposed) setBlocked('סורק אחר פתוח');
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
            if (current.current.canStartScan !== false) {
              void capture.start();
            }
            await new Promise<void>((resolve) => {
              releaseLock = resolve;
              if (disposed) resolve();
            });
          }
        );
      })
      .catch(() => {
        if (!disposed) setBlocked('אי אפשר לסרוק');
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
              title: r.benefitTitle ?? 'הטבה',
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
  const redeem = state.session?.resolution === 'REDEEM_AVAILABLE';
  const phaseLabel = scannerPhaseLabel(state.phase, state.receipt);
  const errorLabel =
    state.phase === 'ERROR' ? scannerErrorLabel(state.code) : '';
  const cameraLabel = cameraStatusLabel(cameraState.status);
  const statusLabel = blocked || errorLabel || phaseLabel || cameraLabel || '';
  const showCameraButton =
    props.canStartScan !== false &&
    !busy &&
    !ready &&
    !success &&
    !blocked &&
    ['idle', 'paused', 'denied', 'error', 'no-camera'].includes(
      cameraState.status
    );
  const resetScan = () => {
    if (commands.current?.reset()) {
      camera.current?.reset();
      setRevision((r) => r + 1);
    }
  };
  return (
    <main
      className="sx-scan"
      data-scanner-phase={state.phase}
      data-scanner-code={state.code ?? ''}
      dir="rtl"
    >
      <style>{SCANNER_CHROME}</style>
      <video ref={video} playsInline={true} muted={true} aria-label="מצלמה" />
      <section className="sx-panel">
        {statusLabel ? (
          <output aria-live="polite" className="sx-status">
            {statusLabel}
          </output>
        ) : null}
        {state.session?.customerDisplayName ? (
          <p className="sx-meta">{state.session.customerDisplayName}</p>
        ) : null}
        {props.canStartScan === false ? (
          <p className="sx-meta">הכרטיסייה לא זמינה</p>
        ) : null}
        {scannerNeedsSubscription(state.code) && state.phase === 'ERROR' ? (
          props.canManageSubscription ? (
            <button
              className="primary"
              type="button"
              onClick={() => router.push('/business/billing')}
            >
              ניהול מנוי
            </button>
          ) : (
            <p className="sx-meta">פנו לבעלים</p>
          )
        ) : null}
        <div className="sx-actions">
          {showCameraButton ? (
            <button
              className="primary"
              type="button"
              onClick={() => void camera.current?.start()}
            >
              הפעלת מצלמה
            </button>
          ) : null}
          {ready ? (
            <button
              className="primary"
              type="button"
              onClick={() => {
                if (redeem && !isArmed('redeem')) {
                  setArmed({ phase: state.phase, action: 'redeem' });
                  return;
                }
                setArmed(null);
                void commands.current?.action(redeem ? 'redeem' : 'stamp');
              }}
            >
              {redeem
                ? isArmed('redeem')
                  ? 'אישור מימוש'
                  : 'ממשו פרס'
                : 'הוסף חותמת'}
            </button>
          ) : null}
          {success && state.receipt?.redemptionContinuationAvailableUntil ? (
            <button
              type="button"
              onClick={() => void commands.current?.action('continuation')}
            >
              מימוש פרס
            </button>
          ) : null}
          {success &&
          state.receipt?.undoAvailableUntil &&
          !state.receipt.undoBlockedReason ? (
            <button
              type="button"
              onClick={() => {
                if (!isArmed('undo')) {
                  setArmed({ phase: state.phase, action: 'undo' });
                  return;
                }
                setArmed(null);
                void commands.current?.action('undo');
              }}
            >
              {isArmed('undo') ? 'אישור ביטול' : 'ביטול'}
            </button>
          ) : null}
          {success
            ? benefits.map((benefit) => (
                <button
                  type="button"
                  key={benefit.rewardId}
                  onClick={() => {
                    const action = `benefit:${benefit.rewardId}`;
                    if (!isArmed(action)) {
                      setArmed({ phase: state.phase, action });
                      return;
                    }
                    setArmed(null);
                    void commands.current?.action('referral', benefit.rewardId);
                  }}
                >
                  {isArmed(`benefit:${benefit.rewardId}`)
                    ? 'אישור הטבה'
                    : benefit.title}
                </button>
              ))
            : null}
          {state.phase === 'UNKNOWN_OUTCOME' ? (
            <button
              type="button"
              onClick={() => void commands.current?.reconcile()}
            >
              בדיקת תוצאה
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
              נסו שוב
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !!blocked}
            onClick={resetScan}
          >
            סריקה חדשה
          </button>
        </div>
        {cameraState.cameras.length > 1 &&
        props.canStartScan !== false &&
        !busy &&
        !ready &&
        !success ? (
          <label className="sx-cameras">
            מצלמה
            <select
              aria-label="בחירת מצלמה"
              value={cameraState.selectedCamera}
              onChange={(event) =>
                void camera.current?.start(event.target.value)
              }
            >
              {cameraState.cameras.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>
    </main>
  );
}

const SCANNER_CHROME = `
.sx-scan{position:relative;display:flex;flex-direction:column;width:100%;min-height:min(68dvh,560px);box-sizing:border-box;background:#0B1220;color:#fff;font-family:Heebo,Arial,sans-serif}
.sx-scan video{width:100%;flex:1;min-height:220px;max-height:52dvh;object-fit:cover;background:#0B1220}
.sx-panel{display:flex;flex-direction:column;gap:8px;padding:12px;background:#101936}
.sx-status,.sx-meta{display:block;margin:0;text-align:right}
.sx-status{font:600 16px/22px Heebo,Arial,sans-serif}
.sx-meta{font:400 13px/18px Heebo,Arial,sans-serif;color:#D5DBE6}
.sx-actions{display:flex;flex-wrap:wrap;gap:8px}
.sx-scan button{min-height:44px;flex:1 1 132px;border-radius:12px;border:1.5px solid #1230A8;background:#fff;color:#1230A8;font:600 16px/1 Heebo,Arial,sans-serif;cursor:pointer;padding:0 12px}
.sx-scan button.primary{background:#1230A8;color:#fff}
.sx-scan button:disabled{opacity:.45;cursor:default}
.sx-cameras{display:flex;align-items:center;gap:8px;font:600 13px/1 Heebo,Arial,sans-serif}
.sx-scan select{min-height:44px;flex:1;border-radius:12px;border:1px solid #D5DBE6;font:400 16px Heebo,Arial,sans-serif;background:#fff;color:#101936}
@media (max-width:430px){
  .sx-scan{min-height:0}
  .sx-scan video{max-height:46dvh;min-height:180px}
  .sx-panel{padding:10px}
}
`;
