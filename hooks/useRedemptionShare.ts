import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, type View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import {
  type RedemptionShareError,
  type RedemptionShareResult,
  runRedemptionShare,
} from '@/lib/redemptionShare';

type UseRedemptionShareOptions = {
  enabled: boolean;
};

export function useRedemptionShare({ enabled }: UseRedemptionShareOptions) {
  const artboardRef = useRef<View>(null);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<RedemptionShareError | null>(
    null
  );

  enabledRef.current = enabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearShareError = useCallback(() => {
    if (mountedRef.current) {
      setShareError(null);
    }
  }, []);

  const share = useCallback(async (): Promise<RedemptionShareResult> => {
    if (
      !enabledRef.current ||
      inFlightRef.current ||
      !artboardRef.current ||
      !mountedRef.current
    ) {
      return { status: 'ignored' };
    }

    setIsSharing(true);
    setShareError(null);

    try {
      const result = await runRedemptionShare({
        isEnabled: () =>
          enabledRef.current &&
          mountedRef.current &&
          Boolean(artboardRef.current),
        captureTarget: artboardRef,
        platform: Platform.OS,
        pixelRatio: PixelRatio.get(),
        inFlight: inFlightRef,
        isSharingAvailable: Sharing.isAvailableAsync,
        capture: (target, options) => captureRef(target, options),
        openNativeShare: (uri, options) => Sharing.shareAsync(uri, options),
        releaseCapture,
      });

      if (mountedRef.current && result.status === 'error') {
        setShareError(result.error);
      }

      return result;
    } finally {
      if (mountedRef.current) {
        setIsSharing(false);
      }
    }
  }, []);

  return {
    artboardRef,
    isSharing,
    shareError,
    clearShareError,
    share,
  };
}
