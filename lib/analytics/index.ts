import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
import type { AnalyticsEventName, BaseAnalyticsProps } from './events';

export type AnalyticsProvider = {
  init?: () => void | Promise<void>;
  track: (
    eventName: AnalyticsEventName | string,
    props: BaseAnalyticsProps & Record<string, unknown>
  ) => void;
  identify?: (
    userId: string,
    traits?: BaseAnalyticsProps & Record<string, unknown>
  ) => void;
};

const ConsoleProvider: AnalyticsProvider = {
  track: (eventName, props) => {
    console.log(
      '[analytics]',
      JSON.stringify({ event: eventName, props }, null, 2)
    );
  },
  identify: (userId, traits) => {
    console.log(
      '[analytics:identify]',
      JSON.stringify({ userId, traits }, null, 2)
    );
  },
};

const PostHogProvider: AnalyticsProvider = {
  init: () => {
    console.warn('[analytics] PostHog provider selected but not configured.');
  },
  track: (eventName, props) => {
    ConsoleProvider.track(eventName, props);
  },
  identify: (userId, traits) => {
    ConsoleProvider.identify?.(userId, traits);
  },
};

const FirebaseProvider: AnalyticsProvider = {
  init: () => {
    console.warn('[analytics] Firebase provider selected but not configured.');
  },
  track: (eventName, props) => {
    ConsoleProvider.track(eventName, props);
  },
  identify: (userId, traits) => {
    ConsoleProvider.identify?.(userId, traits);
  },
};

const UnknownProvider: AnalyticsProvider = {
  track: (eventName, props) => {
    ConsoleProvider.track(eventName, props);
  },
  identify: (userId, traits) => {
    ConsoleProvider.identify?.(userId, traits);
  },
};

function resolveProvider(): AnalyticsProvider {
  const name =
    process.env.EXPO_PUBLIC_ANALYTICS_PROVIDER?.toLowerCase() ?? 'console';

  switch (name) {
    case 'console':
      return ConsoleProvider;
    case 'posthog':
      return PostHogProvider;
    case 'firebase':
      return FirebaseProvider;
    default:
      console.warn(
        `[analytics] Unknown provider "${name}", falling back to console.`
      );
      return UnknownProvider;
  }
}

const provider = resolveProvider();
let initPromise: Promise<void> | null = null;

function getBaseProps(): BaseAnalyticsProps {
  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as { manifest?: { version?: string } }).manifest?.version ??
    null;

  const locale =
    Localization.getLocales()[0]?.languageTag ??
    (Localization as { locale?: string }).locale ??
    null;

  const platform =
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
      ? Platform.OS
      : 'unknown';

  return {
    app_version: appVersion,
    platform,
    locale,
  };
}

export async function initAnalytics() {
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = Promise.resolve(provider.init?.()).then(() => undefined);
  await initPromise;
}

function ensureInitialized() {
  if (!initPromise) {
    void initAnalytics();
  }
}

export function track(
  eventName: AnalyticsEventName | string,
  props: Record<string, unknown> = {}
) {
  ensureInitialized();
  const payload = {
    ...getBaseProps(),
    ...props,
  } as BaseAnalyticsProps & Record<string, unknown>;

  provider.track(eventName, payload);
}

export function identify(userId: string, traits: Record<string, unknown> = {}) {
  ensureInitialized();
  const payload = {
    ...getBaseProps(),
    ...traits,
  } as BaseAnalyticsProps & Record<string, unknown>;

  provider.identify?.(userId, payload);
}
