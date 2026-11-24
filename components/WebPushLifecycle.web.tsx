import { useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
export const PUSH_OWNER_KEY = 'stampaix:push-owner';
export default function WebPushLifecycle() {
  const { user, isLoading } = useUser();
  const actorId = user?._id;
  useEffect(() => {
    if (isLoading || !('serviceWorker' in navigator)) return;
    let disposed = false;
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription || disposed) return;
      let sameOwner = false;
      try {
        sameOwner =
          !!actorId && localStorage.getItem(PUSH_OWNER_KEY) === String(actorId);
      } catch {
        /* Fail closed for a shared browser. */
      }
      if (!sameOwner) {
        await subscription.unsubscribe();
        try {
          localStorage.removeItem(PUSH_OWNER_KEY);
        } catch {}
      }
    })();
    return () => {
      disposed = true;
    };
  }, [actorId, isLoading]);
  return null;
}
