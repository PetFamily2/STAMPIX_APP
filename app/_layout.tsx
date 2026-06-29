import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import React from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';
import { AppModeProvider } from '@/contexts/AppModeContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { PushNotificationsProvider } from '@/contexts/PushNotificationsContext';
import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import * as UserCtx from '@/contexts/UserContext';
import { CONVEX_AUTH_STORAGE_NAMESPACE } from '@/lib/auth/storageKeys';
import {
  RTL_ARCHITECTURE_MARKER,
  rtlBaseView,
  rtlRouteContainerStyle,
} from '@/lib/rtl';
import { getConvexUrl } from '@/utils/convexConfig';

const RTL_RELOAD_ATTEMPT_KEY = 'stampaix:rtl-reload-attempted';

// Resolve the Convex URL from environment-aware configuration.
const convexUrl = getConvexUrl();
const convex = new ConvexReactClient(convexUrl);

// Store auth tokens in expo-secure-store.
// This keeps user session data out of plain AsyncStorage.
const secureStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore secure storage write failures; auth will retry through provider state.
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore secure storage delete failures; auth state handles cleanup fallback.
    }
  },
};

function RtlBootGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<'ready' | 'checking' | 'blocked'>(
    I18nManager.isRTL ? 'ready' : 'checking'
  );

  React.useEffect(() => {
    let isMounted = true;

    async function ensureNativeRtl() {
      if (I18nManager.isRTL) {
        try {
          await SecureStore.deleteItemAsync(RTL_RELOAD_ATTEMPT_KEY);
        } catch {
          // Missing storage should not block a correctly booted RTL app.
        }
        if (isMounted) {
          setState('ready');
        }
        return;
      }

      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
      I18nManager.swapLeftAndRightInRTL(true);

      let alreadyAttemptedReload = false;
      try {
        alreadyAttemptedReload =
          (await SecureStore.getItemAsync(RTL_RELOAD_ATTEMPT_KEY)) === '1';
      } catch {
        alreadyAttemptedReload = true;
      }

      if (!alreadyAttemptedReload) {
        try {
          await SecureStore.setItemAsync(RTL_RELOAD_ATTEMPT_KEY, '1');
          await Updates.reloadAsync();
          return;
        } catch {
          // Fall through to the blocking screen; never show a partial LTR app.
        }
      }

      if (isMounted) {
        setState('blocked');
      }
    }

    ensureNativeRtl();

    return () => {
      isMounted = false;
    };
  }, []);

  if (state === 'ready') {
    return <>{children}</>;
  }

  return (
    <View style={styles.rtlBootScreen}>
      <Text style={styles.rtlBootTitle}>מפעילים תצוגה עברית</Text>
      <Text style={styles.rtlBootText}>
        סגור ופתח את האפליקציה כדי להשלים את מעבר הממשק לימין.
      </Text>
    </View>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: unknown) {
    // Error already shown in render
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'black',
          }}
        >
          <Text style={{ color: 'red', fontSize: 16 }}>
            {this.state.error?.message ?? 'שגיאה לא ידועה'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent={false} backgroundColor="#F6F8FC" />
      <RtlBootGuard>
        <ConvexAuthProvider
          client={convex}
          storage={secureStorage}
          storageNamespace={CONVEX_AUTH_STORAGE_NAMESPACE}
        >
          <UserCtx.UserProvider>
            <PushNotificationsProvider>
              <ActiveBusinessProvider>
                <AppModeProvider>
                  <OnboardingProvider>
                    <RevenueCatProvider>
                      <RootErrorBoundary>
                        <View
                          style={styles.rtlRoot}
                          testID={RTL_ARCHITECTURE_MARKER}
                        >
                          <Slot />
                        </View>
                      </RootErrorBoundary>
                    </RevenueCatProvider>
                  </OnboardingProvider>
                </AppModeProvider>
              </ActiveBusinessProvider>
            </PushNotificationsProvider>
          </UserCtx.UserProvider>
        </ConvexAuthProvider>
      </RtlBootGuard>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rtlRoot: {
    ...rtlRouteContainerStyle,
  },
  rtlBootScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#F6F8FC',
    ...rtlBaseView,
  },
  rtlBootTitle: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  rtlBootText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
