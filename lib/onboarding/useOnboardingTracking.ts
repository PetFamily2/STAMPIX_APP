import { useFocusEffect } from '@react-navigation/native';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type OnboardingRole,
} from '@/lib/analytics/events';
import { getOrCreateOnboardingSessionId } from '@/lib/onboarding/session';

type OnboardingTrackingOptions = {
  screen: string;
  role?: OnboardingRole;
};

type TrackExtras = Record<string, unknown>;

type OnboardingTracking = {
  onboardingSessionId: string | null;
  trackChoice: (field: string, value: unknown, extra?: TrackExtras) => void;
  trackContinue: (extra?: TrackExtras) => void;
  trackError: (field: string, errorCode: string, extra?: TrackExtras) => void;
  completeStep: (extra?: TrackExtras) => void;
  trackEvent: (eventName: AnalyticsEventName, extra?: TrackExtras) => void;
};

export function useOnboardingTracking({
  screen,
  role,
}: OnboardingTrackingOptions): OnboardingTracking {
  const pathname = usePathname();
  const [onboardingSessionId, setOnboardingSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const roleRef = useRef<OnboardingRole | undefined>(role);
  const startRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const viewedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resolveSessionId = useCallback(async () => {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }
    const id = await getOrCreateOnboardingSessionId();
    sessionIdRef.current = id;
    if (isMountedRef.current) {
      setOnboardingSessionId(id);
    }
    return id;
  }, []);

  const trackWithSession = useCallback(
    async (eventName: AnalyticsEventName, extra: TrackExtras = {}) => {
      const id = await resolveSessionId();
      track(eventName, {
        screen,
        pathname,
        role: roleRef.current,
        onboardingSessionId: id,
        ...extra,
      });
    },
    [pathname, resolveSessionId, screen]
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      completedRef.current = false;
      startRef.current = Date.now();

      void (async () => {
        const id = await resolveSessionId();
        if (!isActive || viewedRef.current) {
          return;
        }
        viewedRef.current = true;
        track(ANALYTICS_EVENTS.onboardingScreenViewed, {
          screen,
          pathname,
          role: roleRef.current,
          onboardingSessionId: id,
        });
      })();

      return () => {
        isActive = false;
        const startedAt = startRef.current;
        const durationMs = startedAt ? Date.now() - startedAt : 0;

        if (!completedRef.current) {
          void trackWithSession(ANALYTICS_EVENTS.onboardingStepAbandoned, {
            duration_ms: durationMs,
          });
        }

        viewedRef.current = false;
      };
    }, [pathname, resolveSessionId, screen, trackWithSession])
  );

  const trackChoice = useCallback(
    (field: string, value: unknown, extra: TrackExtras = {}) => {
      void trackWithSession(ANALYTICS_EVENTS.onboardingChoiceSelected, {
        field,
        value,
        ...extra,
      });
    },
    [trackWithSession]
  );

  const trackContinue = useCallback(
    (extra: TrackExtras = {}) => {
      void trackWithSession(ANALYTICS_EVENTS.onboardingContinueClicked, extra);
    },
    [trackWithSession]
  );

  const trackError = useCallback(
    (field: string, errorCode: string, extra: TrackExtras = {}) => {
      void trackWithSession(ANALYTICS_EVENTS.onboardingError, {
        field,
        error_code: errorCode,
        ...extra,
      });
    },
    [trackWithSession]
  );

  const completeStep = useCallback(
    (extra: TrackExtras = {}) => {
      completedRef.current = true;
      const startedAt = startRef.current;
      const durationMs = startedAt ? Date.now() - startedAt : 0;

      void trackWithSession(ANALYTICS_EVENTS.onboardingStepCompleted, {
        duration_ms: durationMs,
        ...extra,
      });
    },
    [trackWithSession]
  );

  const trackEvent = useCallback(
    (eventName: AnalyticsEventName, extra: TrackExtras = {}) => {
      void trackWithSession(eventName, extra);
    },
    [trackWithSession]
  );

  return {
    onboardingSessionId,
    trackChoice,
    trackContinue,
    trackError,
    completeStep,
    trackEvent,
  };
}
