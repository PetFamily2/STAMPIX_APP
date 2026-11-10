import { useEffect, useRef, useState } from 'react';
import { BUSINESS_WEB_TOKENS as TOKENS } from '../../lib/design/businessWebTokens';
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
import {
  cameraDisplayName,
  cameraStatusMessage,
} from '../../lib/web-scanner/presentation';
import { createRawWorkerDecoder } from '../../lib/web-scanner/rawWorker';
import { recoveryIdentity } from '../../lib/web-scanner/recovery';
import { initialScannerState } from '../../lib/web-scanner/state';
import {
  scannerErrorLabel,
  scannerNeedsSubscription,
  scannerSuccessLabel,
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
  const current = useRef(props);
  current.current = props;
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<WebQrController | null>(null);
  const commands = useRef<WebScannerCommands | null>(null);
  const lockLease = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState(initialCommand);
  const [cameraState, setCameraState] = useState(initialScannerState);
  const [blocked, setBlocked] = useState<string | null>('מכינים את הסורק');
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
    setBlocked('מכינים את הסורק');
    setState(initialCommand);
    setCameraState(initialScannerState);
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
            void capture.start();
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
  ]);
  const ready = state.phase === 'READY_FOR_ACTION';
  const success = state.phase === 'SUCCESS';
  const cameraActive =
    cameraState.status === 'scanning' || cameraState.status === 'locked';
  const requestingCamera = cameraState.status === 'requesting';
  const cameraError = [
    'denied',
    'no-camera',
    'error',
    'insecure',
    'unsupported',
  ].includes(cameraState.status);
  const redeem = state.session?.resolution === 'REDEEM_AVAILABLE';
  const membership = state.session?.membership;
  const stampProgress =
    membership && typeof membership.currentStamps === 'number'
      ? `${membership.currentStamps}/${membership.maxStamps}`
      : null;
  const nextCustomer = () => {
    if (!commands.current?.reset()) return;
    camera.current?.continueScanning();
  };
  const showPanel =
    !!blocked ||
    cameraError ||
    ready ||
    success ||
    state.phase === 'ERROR' ||
    state.phase === 'UNKNOWN_OUTCOME';
  const busy = [
    'QR_LOCKED',
    'RESOLVING',
    'COMMITTING',
    'UNKNOWN_OUTCOME',
    'RECONCILING',
  ].includes(state.phase);
  return (
    <main
      className="sx-scan"
      data-scanner-phase={state.phase}
      data-scanner-code={state.code ?? ''}
      dir="rtl"
    >
      <style>{SCANNER_CHROME}</style>
      <div className="sx-camera" data-camera-active={cameraActive}>
        <video
          ref={video}
          playsInline={true}
          muted={true}
          aria-label="מצלמת סריקת קוד לקוח"
        />
        {cameraActive ? <div className="sx-target" aria-hidden="true" /> : null}
      </div>
      {showPanel ? <section className="sx-copy">
        {blocked ? <p role="alert">{blocked}</p> : null}
        {cameraError ? (
          <p role="alert">{cameraStatusMessage(cameraState.status)}</p>
        ) : null}
        {state.phase === 'ERROR' ? (
          <p role="alert">{scannerErrorLabel(state.code)}</p>
        ) : null}
        {scannerNeedsSubscription(state.code) && state.phase === 'ERROR' ? (
          props.canManageSubscription ? (
            <a className="sx-billing" href="/business/billing">
              ניהול מנוי
            </a>
          ) : (
            <p>פנו לבעלים</p>
          )
        ) : null}
        {ready && state.session ? (
          <>
            <p className="sx-name">{state.session.customerDisplayName}</p>
            {stampProgress ? <p className="sx-progress">{stampProgress}</p> : null}
            <p>{redeem ? 'הטבה מוכנה למימוש' : 'נדרש אישור חותמת'}</p>
          </>
        ) : null}
        {success ? (
          <>
            <p className="sx-name">
              {state.session?.customerDisplayName ?? ''}
            </p>
            <p>{scannerSuccessLabel(state.receipt)}</p>
          </>
        ) : null}
        <div className="sx-actions">
          {cameraError && !cameraActive ? (
            <button
              className="primary"
              type="button"
              disabled={!!blocked || requestingCamera}
              onClick={() => void camera.current?.start()}
            >
              הפעלת מצלמה
            </button>
          ) : null}
          {ready ? (
            <button
              className="primary"
              type="button"
              onClick={() =>
                void commands.current?.action(redeem ? 'redeem' : 'stamp')
              }
            >
              {redeem ? 'מימוש ההטבה' : 'אישור חותמת'}
            </button>
          ) : null}
          {ready ? (
            <button type="button" onClick={nextCustomer}>
              לא עכשיו
            </button>
          ) : null}
          {success &&
          state.receipt?.undoAvailableUntil &&
          !state.receipt.undoBlockedReason ? (
            <button
              type="button"
              onClick={() => void commands.current?.action('undo')}
            >
              ביטול
            </button>
          ) : null}
          {success ? (
            <button type="button" onClick={nextCustomer}>
              הלקוח הבא
            </button>
          ) : null}
          {state.phase === 'UNKNOWN_OUTCOME' ? (
            <button
              type="button"
              onClick={() => void commands.current?.reconcile()}
            >
              בירור תוצאה
            </button>
          ) : null}
        </div>
        {cameraState.cameras.length > 1 &&
        props.canStartScan !== false &&
        !busy &&
        !ready &&
        !success ? (
          <label>
            מצלמה{' '}
            <select
              disabled={!!blocked || requestingCamera}
              value={cameraState.selectedCamera}
              onChange={(event) =>
                void camera.current?.start(event.target.value)
              }
            >
              {cameraState.cameras.map((c, index) => (
                <option value={c.id} key={c.id}>
                  {cameraDisplayName(c.label, index)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section> : null}
    </main>
  );
}

const SCANNER_CHROME = `
.sx-scan{width:100%;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;padding:16px 0;font-family:Heebo,Arial,sans-serif;color:${TOKENS.colors.textPrimary}}
.sx-scan h2{margin:0;font-size:18px;line-height:26px;font-weight:600;text-align:right}
.sx-scan p{margin:0;text-align:right;color:${TOKENS.colors.textSecondary};line-height:1.6;overflow-wrap:anywhere}
.sx-camera{position:relative;overflow:hidden;border-radius:${TOKENS.radii.lg}px;background:${TOKENS.colors.subtleSurface};width:100%;aspect-ratio:4/3;max-height:360px}
.sx-camera video{width:100%;height:100%;object-fit:cover;background:#0B1220}
.sx-name{color:${TOKENS.colors.textPrimary};font-weight:600}
.sx-progress{font-size:22px;font-weight:600;color:${TOKENS.colors.textPrimary}}
.sx-camera-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;box-sizing:border-box;color:${TOKENS.colors.textSecondary}}
.sx-camera-placeholder strong{color:${TOKENS.colors.textPrimary};font-size:18px}
.sx-target{position:absolute;inset:18%;border:2px dashed ${TOKENS.colors.elevatedSurface};border-radius:${TOKENS.radii.md}px;pointer-events:none}
.sx-copy{display:flex;flex-direction:column;gap:12px}
.sx-actions{display:flex;flex-direction:column;gap:8px}
.sx-scan button{min-height:${TOKENS.control.height}px;padding:12px;border-radius:${TOKENS.radii.md}px;border:1px solid ${TOKENS.colors.borderStrong};background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.primary};font:600 16px/1.4 Heebo,Arial,sans-serif;cursor:pointer}
.sx-scan button.primary{background:${TOKENS.colors.primary};border-color:${TOKENS.colors.primary};color:${TOKENS.colors.elevatedSurface}}
.sx-scan button:disabled{opacity:.45;cursor:default}
.sx-billing{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:${TOKENS.radii.md}px;background:${TOKENS.colors.primary};color:${TOKENS.colors.elevatedSurface};font:600 16px/1 Heebo,Arial,sans-serif;text-decoration:none}
.sx-scan label{display:flex;flex-direction:column;gap:8px}
.sx-scan select{width:100%;min-width:0;min-height:${TOKENS.control.height}px;padding:8px 12px;background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.textPrimary};border-radius:${TOKENS.radii.md}px;border:1px solid ${TOKENS.colors.borderStrong};font:400 16px Heebo,Arial,sans-serif}
@media (min-width:1024px){
  .sx-scan{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,340px);align-items:start;padding:24px 0}
  .sx-camera{grid-column:1;grid-row:1}
  .sx-copy{grid-column:2;grid-row:1}
}
`;
