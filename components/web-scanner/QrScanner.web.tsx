import { useEffect, useRef, useState } from 'react';
import {
  attachCameraLifecycle,
  WebQrController,
} from '../../lib/web-scanner/controller';
import {
  createFrameCapture,
  createLocalDecoder,
} from '../../lib/web-scanner/decoder';
import {
  initialScannerState,
  type ScannerStatus,
} from '../../lib/web-scanner/state';
import DecoderFixture from './DecoderFixture.web';

const labels: Record<ScannerStatus, string> = {
  idle: 'המצלמה כבויה',
  requesting: 'ממתינים להרשאת מצלמה',
  scanning: 'כוונו את ה־QR למרכז התמונה',
  locked: 'QR נקרא בהצלחה',
  paused: 'המצלמה הושהתה',
  denied: 'אין הרשאת מצלמה',
  'no-camera': 'לא נמצאה מצלמה',
  insecure: 'נדרש חיבור HTTPS מאובטח',
  unsupported: 'גישה למצלמה אינה זמינה בדפדפן זה',
  error: 'לא הצלחנו להפעיל את הסריקה',
};

/** Explicit Web adapter, used ONLY by the independent Preview lab. */
export default function QrScannerWeb() {
  const video = useRef<HTMLVideoElement>(null);
  const controller = useRef<WebQrController | null>(null);
  const [state, setState] = useState(initialScannerState);
  const [scenario] = useState(() =>
    new URLSearchParams(window.location.search).get('scenario')
  );
  const simulated = scenario === 'denied' || scenario === 'no-camera';

  useEffect(() => {
    if (!video.current) {
      return;
    }
    // Preview-only fixtures exercise the same permission/controller paths.
    const media = simulated
      ? {
          getUserMedia: () =>
            Promise.reject(
              new DOMException(
                'Preview fixture',
                scenario === 'denied' ? 'NotAllowedError' : 'NotFoundError'
              )
            ),
          enumerateDevices: () => Promise.resolve([]),
        }
      : typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? navigator.mediaDevices
        : undefined;
    const camera = new WebQrController({
      video: video.current,
      media,
      secure: window.isSecureContext && window.location.protocol === 'https:',
      isVisible: () => document.visibilityState === 'visible',
      capture: createFrameCapture(video.current),
      createDecoder: createLocalDecoder,
      onState: setState,
    });
    controller.current = camera;
    const detach = attachCameraLifecycle(camera, document, window);
    return () => {
      controller.current = null;
      detach();
    };
  }, [scenario, simulated]);

  const requesting = state.status === 'requesting';
  const scanning = state.status === 'scanning';
  const locked = state.status === 'locked';
  return (
    <main className="lab" dir="rtl">
      <div className="brand" dir="ltr">
        StampAix
      </div>
      <span className="badge">מעבדת סריקה · Preview בלבד</span>
      <h1>בדיקת QR בדפדפן</h1>
      <p className="intro">
        בדיקה מקומית של מצלמה וקריאת קוד. אין החתמה או מימוש הטבה.
      </p>
      {simulated ? (
        <output className="simulation">
          מצב הדמיה לבדיקת ממשק — לא מתבקשת גישה למצלמה.
        </output>
      ) : null}
      <div className="camera">
        <video
          ref={video}
          playsInline={true}
          muted={true}
          aria-label="תצוגת מצלמה לסריקת QR"
        />
        {!scanning ? (
          <div className="camera-cover">{labels[state.status]}</div>
        ) : null}
        {scanning ? <div className="frame" aria-hidden="true" /> : null}
      </div>
      <div className="status" aria-live="polite" aria-atomic="true">
        <h2>{labels[state.status]}</h2>
        {state.result ? (
          <p>סוג: QR · אורך הנתון: {state.result.length} תווים</p>
        ) : null}
        {state.status === 'denied' ? (
          <p>אפשרו למצלמה גישה בהגדרות האתר בדפדפן, ואז נסו שוב.</p>
        ) : null}
        {state.status === 'no-camera' ? (
          <p>חברו מצלמה או פתחו את הבדיקה בטלפון עם מצלמה זמינה.</p>
        ) : null}
        {state.status === 'error' ? (
          <p>סגרו אפליקציות שמשתמשות במצלמה ונסו להפעיל מחדש.</p>
        ) : null}
        {scanning ? (
          <p>הרחיקו מעט את הקוד אם התמונה מטושטשת. אפשר לבחור עדשה אחרת.</p>
        ) : null}
        {requesting ? (
          <p>בחרו באישור בחלון הדפדפן. אפשר לבטל את הבדיקה בכל רגע.</p>
        ) : null}
      </div>
      {state.cameras.length > 1 ? (
        <label className="camera-select">
          בחירת מצלמה
          <select
            value={state.selectedCamera}
            disabled={requesting || locked}
            onChange={(event) =>
              void controller.current?.start(event.target.value)
            }
          >
            {state.cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="actions">
        <button
          type="button"
          disabled={requesting || scanning || locked}
          onClick={() => void controller.current?.start()}
        >
          {state.status === 'idle' ? 'הפעלת מצלמה' : 'הפעלה מחדש'}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => controller.current?.reset()}
        >
          איפוס סריקה
        </button>
        <button
          className="secondary"
          type="button"
          disabled={!requesting && !scanning}
          onClick={() => controller.current?.stop()}
        >
          עצירת מצלמה
        </button>
      </div>
      <p className="privacy">תוכן ה־QR אינו מוצג, נשמר או נשלח לשרת.</p>
      {scenario === 'decode-fixture' ? <DecoderFixture /> : null}
    </main>
  );
}
