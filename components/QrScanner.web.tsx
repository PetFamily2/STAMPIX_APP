import { useEffect, useRef, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { sharedBackendEnabled } from '@/config/sharedBackend';
import { useUser } from '@/contexts/UserContext';
import {
  attachCameraLifecycle,
  WebQrController,
} from '@/lib/web-scanner/controller';
import { createFrameCapture } from '@/lib/web-scanner/decoder';
import { scannerPreviewEnabled } from '@/lib/web-scanner/previewGate';
import { createRawWorkerDecoder } from '@/lib/web-scanner/rawWorker';
import { initialScannerState } from '@/lib/web-scanner/state';
import { getConvexUrl } from '@/utils/convexConfig';

type Props = {
  onScan: (data: string) => Promise<void> | void;
  resetKey?: number;
  isBusy?: boolean;
  caption?: string;
  showStatus?: boolean;
  cameraMinHeight?: number;
  onTapWhileScanned?: () => void;
  style?: StyleProp<ViewStyle>;
};
const labels = {
  idle: 'המצלמה כבויה',
  requesting: 'ממתינים להרשאת מצלמה',
  scanning: 'כוונו את קוד ה־QR למצלמה',
  locked: 'הקוד נקרא',
  paused: 'המצלמה מושהית',
  denied: 'הרשאת המצלמה נדחתה. אפשר לשנות אותה בהגדרות הדפדפן ולנסות שוב.',
  'no-camera': 'לא נמצאה מצלמה זמינה.',
  insecure: 'סריקה דורשת HTTPS.',
  unsupported: 'המצלמה אינה נתמכת בדפדפן הזה.',
  error: 'לא ניתן להפעיל את המצלמה. נסו להפעיל אותה מחדש.',
};
export default function QrScanner(props: Props) {
  const { user } = useUser();
  const current = useRef(props);
  current.current = props;
  const video = useRef<HTMLVideoElement>(null),
    controller = useRef<WebQrController | null>(null);
  const [state, setState] = useState(initialScannerState);
  const enabled =
    (!!user &&
      sharedBackendEnabled({
        environment: process.env.EXPO_PUBLIC_APP_ENV,
        flag: process.env.EXPO_PUBLIC_STAMPAIX_SHARED_BACKEND,
        url: getConvexUrl(),
      })) ||
    scannerPreviewEnabled({
      platform: 'web',
      environment: process.env.EXPO_PUBLIC_APP_ENV,
      flag: process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS,
      backend: process.env.EXPO_PUBLIC_WEB_SCANNER_BACKEND,
      url: getConvexUrl(),
      previewUrl: process.env.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL,
      prodUrl: process.env.EXPO_PUBLIC_CONVEX_URL_PROD,
      actors: process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_ACTORS,
      businesses: process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_BUSINESSES,
      actorId: user?._id,
      businessId:
        process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_BUSINESSES?.split(
          ','
        )[0]?.trim(),
    });
  useEffect(() => {
    void props.resetKey; // A parent reset creates a fresh camera lifecycle.
    const element = video.current;
    if (!enabled || !element) return;
    let disposed = false,
      raw: string | null = null;
    const capture = new WebQrController({
      video: element,
      media: navigator.mediaDevices,
      secure: isSecureContext && location.protocol === 'https:',
      isVisible: () => document.visibilityState === 'visible',
      capture: createFrameCapture(element),
      createDecoder: () =>
        createRawWorkerDecoder((value) => {
          raw = value;
        }),
      onState: (next) => {
        if (disposed) return;
        setState(next);
        if (next.status === 'locked') {
          const value = raw;
          raw = null;
          if (value && !current.current.isBusy)
            void Promise.resolve(current.current.onScan(value)).catch(() => {});
        }
      },
    });
    controller.current = capture;
    const detach = attachCameraLifecycle(capture, document, window);
    return () => {
      disposed = true;
      raw = null;
      detach();
      if (controller.current === capture) controller.current = null;
    };
  }, [enabled, props.resetKey]);
  if (!enabled)
    return (
      <View style={props.style}>
        <p dir="rtl">הסריקה אינה זמינה כרגע. אפשר להזין קוד הצטרפות ידנית.</p>
      </View>
    );
  return (
    <View style={[{ minHeight: props.cameraMinHeight ?? 300 }, props.style]}>
      <section
        dir="rtl"
        style={{ width: '100%', maxWidth: 640, margin: 'auto' }}
      >
        <video
          ref={video}
          playsInline={true}
          muted={true}
          aria-label="מצלמה לסריקת QR"
          style={{
            width: '100%',
            maxHeight: 420,
            objectFit: 'cover',
            background: '#172033',
            borderRadius: 16,
          }}
        />
        {props.showStatus !== false ? (
          <output>
            {props.caption ??
              (props.isBusy
                ? 'בודקים את הקוד'
                : (labels[state.status as keyof typeof labels] ??
                  'המצלמה אינה זמינה כרגע'))}
          </output>
        ) : null}
        <button
          type="button"
          disabled={
            props.isBusy ||
            state.status === 'locked' ||
            state.status === 'requesting'
          }
          onClick={() => void controller.current?.start()}
          style={{ minHeight: 44 }}
        >
          הפעלת מצלמה / ניסיון מחדש
        </button>
        {state.cameras.length > 1 ? (
          <label>
            מצלמה{' '}
            <select
              disabled={props.isBusy || state.status === 'locked'}
              value={state.selectedCamera ?? ''}
              onChange={(event) =>
                void controller.current?.start(event.target.value)
              }
            >
              <option value="">מצלמה אחורית</option>
              {state.cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {state.status === 'locked' && props.onTapWhileScanned ? (
          <button
            type="button"
            disabled={props.isBusy}
            onClick={props.onTapWhileScanned}
          >
            הקוד כבר נקרא
          </button>
        ) : null}
      </section>
    </View>
  );
}
