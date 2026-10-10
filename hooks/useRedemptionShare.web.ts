import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import { useUser } from '@/contexts/UserContext';
import type { RedemptionShareError } from '@/lib/redemptionShare';
import { captureRedemptionArtboard } from '@/lib/webRedemptionCapture';
import { shareRedemptionImage } from '@/lib/webRedemptionShare';

export function useRedemptionShare(options: {
  enabled: boolean;
  authorize?: () => Promise<boolean>;
}) {
  const { user } = useUser();
  const artboardRef = useRef<View>(null);
  const current = useRef({ ...options, actorId: user?._id });
  current.current = { ...options, actorId: user?._id };
  const mounted = useRef(true),
    pending = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<RedemptionShareError | null>(
    null
  );
  const [shareNotice, setShareNotice] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const clearShareError = useCallback(() => {
    setShareError(null);
    setShareNotice('');
  }, []);
  const share = useCallback(async () => {
    if (pending.current) return { status: 'ignored' as const };
    const actorId = current.current.actorId;
    const authorize = current.current.authorize;
    const target = artboardRef.current;
    const valid = () =>
      mounted.current &&
      !!actorId &&
      current.current.actorId === actorId &&
      current.current.authorize === authorize &&
      current.current.enabled &&
      artboardRef.current === target &&
      !!target &&
      navigator.onLine !== false;
    if (!valid()) return { status: 'ignored' as const };
    pending.current = true;
    setIsSharing(true);
    setShareError(null);
    setShareNotice('');
    try {
      const result = await shareRedemptionImage({
        valid,
        authorize: () => authorize?.() ?? Promise.resolve(false),
        capture: () => captureRedemptionArtboard(target),
        canShare: (file) =>
          typeof navigator.share === 'function' &&
          navigator.canShare?.({ files: [file] }) === true,
        share: (file) =>
          navigator.share({ files: [file], title: 'שיתוף רגע המימוש' }),
        download: (file) => {
          const url = URL.createObjectURL(file),
            link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          document.body.append(link);
          try {
            link.click();
          } finally {
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        },
      });
      if (valid()) {
        if (result.status === 'error') setShareError(result.error);
        if (result.status === 'downloaded')
          setShareNotice('תמונת המימוש הורדה. אפשר לשתף אותה מהמכשיר.');
      }
      return result;
    } finally {
      pending.current = false;
      if (mounted.current) setIsSharing(false);
    }
  }, []);
  return {
    artboardRef,
    isSharing,
    shareError,
    shareNotice,
    clearShareError,
    share,
  };
}
