import { useConvexAuth } from 'convex/react';
import { Slot, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { IS_DEV_MODE } from '@/config/appConfig';

export default function AuthRoutesLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const segments = useSegments();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const router = useRouter();
  const redirectTriggeredRef = useRef(false);

  const segmentStrings = segments as string[];
  const isPreviewMode = IS_DEV_MODE && preview === 'true';
  const isPaywallRoute = segmentStrings.includes('paywall');
  const isAllowedForAuthenticated = isPaywallRoute || isPreviewMode;
  const shouldRedirectToAuthenticated = isAuthenticated && !isAllowedForAuthenticated;

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7243/ingest/1ea5e66d-d528-4bae-a881-fff31ff26db7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/(auth)/_layout.tsx:mount',
        message: 'Auth layout state',
        data: { isAuthenticated, isLoading, segments: segments, preview },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'B,E',
      }),
    }).catch(() => {});
  }, [isAuthenticated, isLoading, segments, preview]);
  // #endregion

  useEffect(() => {
    if (!shouldRedirectToAuthenticated || redirectTriggeredRef.current) {
      return;
    }
    redirectTriggeredRef.current = true;
    router.replace('/(authenticated)');
  }, [router, shouldRedirectToAuthenticated]);

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7243/ingest/168601ea-5d52-4951-bd11-4111d1ca1f9f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/(auth)/_layout.tsx:auth-check',
        message: 'Auth redirect check',
        data: {
          isAuthenticated,
          isLoading,
          segments: segmentStrings,
          isPaywallRoute,
          isAllowedForAuthenticated,
          preview,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'A,B',
      }),
    }).catch(() => {});
  }, [isAuthenticated, isLoading, segments, preview]);
  // #endregion

  // המתנה לטעינת סטטוס האימות
  if (isLoading) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/1ea5e66d-d528-4bae-a881-fff31ff26db7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/(auth)/_layout.tsx:loading',
        message: 'Auth loading - returning null',
        data: {},
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'B',
      }),
    }).catch(() => {});
    // #endregion
    return null;
  }

  // אם המשתמש כבר מחובר, הפנה אותו לאזור המאומת
  // אלא אם הוא במסלול paywall או במצב תצוגה מקדימה
  // זה מונע ממשתמשים מחוברים לגשת למסכי התחברות/הרשמה
  // אבל מאפשר להם לגשת דרך הגדרות/דיבאג במצב preview
  if (shouldRedirectToAuthenticated) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/168601ea-5d52-4951-bd11-4111d1ca1f9f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/(auth)/_layout.tsx:redirect',
        message: 'Triggering redirect to authenticated',
        data: { segments: segmentStrings, preview },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'A,C',
      }),
    }).catch(() => {});
    // #endregion
    return null;
  }

  // שימוש ב-Slot כדי לעבד את המסכים הפנימיים (sign-in, sign-up, paywall)
  // אנחנו משתמשים ב-Slot במקום Stack כי ה-Layout הראשי כבר מספק את הקונטקסט הדרוש
  return <Slot />;
}
