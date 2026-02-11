import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '@/lib/analytics';
import type {
  AnalyticsEventName,
  OnboardingRole,
} from '@/lib/analytics/events';
import { getOnboardingSessionId } from '@/lib/onboarding/session';

type ActivationContext = {
  role: OnboardingRole;
  userId?: string;
};

type ActivationProps = Record<string, unknown>;

export async function trackActivationEvent(
  eventName: AnalyticsEventName,
  context: ActivationContext,
  props: ActivationProps = {}
) {
  const sessionId = await getOnboardingSessionId();
  const baseProps = sessionId
    ? { onboardingSessionId: sessionId, role: context.role }
    : { userId: context.userId, role: context.role };

  track(eventName, {
    ...baseProps,
    ...props,
  });
}

const ACTIVATION_KEY_PREFIX = 'activation_event:';

export async function trackActivationOnce(
  eventName: AnalyticsEventName,
  dedupeKey: string,
  context: ActivationContext,
  props: ActivationProps = {}
) {
  const storageKey = `${ACTIVATION_KEY_PREFIX}${eventName}:${dedupeKey}`;
  const existing = await AsyncStorage.getItem(storageKey);
  if (existing) {
    return;
  }

  await AsyncStorage.setItem(storageKey, '1');
  await trackActivationEvent(eventName, context, props);
}
