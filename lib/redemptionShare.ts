export const REDEMPTION_SHARE_WIDTH = 1080;
export const REDEMPTION_SHARE_HEIGHT = 1920;

export type RedemptionShareError =
  | 'sharing-unavailable'
  | 'capture-failed'
  | 'native-share-failed';

export type RedemptionShareResult =
  | { status: 'shared' }
  | { status: 'ignored' }
  | { status: 'error'; error: RedemptionShareError };

type InFlightMutex = {
  current: boolean;
};

type CaptureOptions = {
  format: 'png';
  quality: number;
  result: 'tmpfile';
  width: number;
  height: number;
};

type NativeShareOptions = {
  mimeType: 'image/png';
  UTI: 'public.png';
  dialogTitle: string;
};

type RunRedemptionShareOptions<TTarget> = {
  isEnabled: () => boolean;
  captureTarget: TTarget | null;
  platform: string;
  pixelRatio: number;
  inFlight: InFlightMutex;
  isSharingAvailable: () => Promise<boolean>;
  capture: (target: TTarget, options: CaptureOptions) => Promise<string>;
  openNativeShare: (uri: string, options: NativeShareOptions) => Promise<void>;
  releaseCapture: (uri: string) => void;
};

export function getRedemptionCaptureDimensions(
  platform: string,
  pixelRatio: number
) {
  const iosScale =
    platform === 'ios' && Number.isFinite(pixelRatio) && pixelRatio > 0
      ? pixelRatio
      : 1;

  return {
    width: REDEMPTION_SHARE_WIDTH / iosScale,
    height: REDEMPTION_SHARE_HEIGHT / iosScale,
  };
}

export async function runRedemptionShare<TTarget>({
  isEnabled,
  captureTarget,
  platform,
  pixelRatio,
  inFlight,
  isSharingAvailable,
  capture,
  openNativeShare,
  releaseCapture,
}: RunRedemptionShareOptions<TTarget>): Promise<RedemptionShareResult> {
  if (!isEnabled() || inFlight.current || !captureTarget) {
    return { status: 'ignored' };
  }

  inFlight.current = true;
  let captureUri: string | null = null;

  try {
    let canOpenNativeShare: boolean;
    try {
      canOpenNativeShare = await isSharingAvailable();
    } catch {
      return { status: 'error', error: 'native-share-failed' };
    }

    if (!canOpenNativeShare) {
      return { status: 'error', error: 'sharing-unavailable' };
    }

    if (!isEnabled()) {
      return { status: 'ignored' };
    }

    const captureDimensions = getRedemptionCaptureDimensions(
      platform,
      pixelRatio
    );

    try {
      captureUri = await capture(captureTarget, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        ...captureDimensions,
      });
    } catch {
      return { status: 'error', error: 'capture-failed' };
    }

    if (!isEnabled()) {
      return { status: 'ignored' };
    }

    const localUri = captureUri.startsWith('file://')
      ? captureUri
      : `file://${captureUri}`;

    try {
      await openNativeShare(localUri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'שיתוף רגע המימוש',
      });
    } catch {
      return { status: 'error', error: 'native-share-failed' };
    }

    return { status: 'shared' };
  } finally {
    try {
      if (captureUri) {
        releaseCapture(captureUri);
      }
    } catch {
      // tmpfile captures are also removed by view-shot when the app exits.
    } finally {
      inFlight.current = false;
    }
  }
}
