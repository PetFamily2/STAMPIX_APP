import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';
import { AppModeProvider } from '@/contexts/AppModeContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { PushNotificationsProvider } from '@/contexts/PushNotificationsContext';
import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import * as UserCtx from '@/contexts/UserContext';
import { CONVEX_AUTH_STORAGE_NAMESPACE } from '@/lib/auth/storageKeys';
import { rtlBaseView } from '@/lib/rtl';
import { getConvexUrl } from '@/utils/convexConfig';

// RTL strategy: prefer Expo/RN native RTL, with shared helpers providing a
// manual fallback only if the runtime still reports LTR.

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
            {this.state.error?.message ?? 'Unknown error'}
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
                      <View style={styles.rtlRoot}>
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rtlRoot: {
    flex: 1,
    ...rtlBaseView,
  },
});
