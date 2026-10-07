import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

import PwaRuntime from '@/components/PwaRuntime';
import WebAlertHost from '@/components/WebAlertHost';
import WebPushLifecycle from '@/components/WebPushLifecycle';
import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';
import { AppModeProvider } from '@/contexts/AppModeContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { PushNotificationsProvider } from '@/contexts/PushNotificationsContext';
import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import * as UserCtx from '@/contexts/UserContext';
import { getConvexAuthProviderStorageProps } from '@/lib/auth/authStorage';
import { disposeFeedbackAudioPlayers } from '@/lib/feedback';
import { retainRtlArchitectureMarker } from '@/lib/rtl';
import { getConvexUrl } from '@/utils/convexConfig';

// StampAix uses manual RTL helpers from lib/rtl.ts to avoid double inversion
// between native RTL and explicit row-reverse layout.
retainRtlArchitectureMarker();

const convexUrl = getConvexUrl();
const convex = new ConvexReactClient(convexUrl);
const convexAuthStorageProps = getConvexAuthProviderStorageProps();

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
            {Platform.OS === 'web' ? 'לא הצלחנו לטעון את המסך. אפשר לרענן כשאין פעולה ממתינה.' : (this.state.error?.message ?? 'שגיאה לא ידועה')}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...(Platform.OS !== 'web'
      ? { SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') }
      : {}),
  });

  React.useEffect(
    () => () => {
      disposeFeedbackAudioPlayers();
    },
    []
  );

  // Web screens use a CSS fallback while fonts load; keep Native's existing font gate.
  if (!fontsLoaded && Platform.OS !== 'web') {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent={false} backgroundColor="#F6F8FC" />
      <ConvexAuthProvider
        client={convex}
        storageNamespace={convexAuthStorageProps.storageNamespace}
        {...(convexAuthStorageProps.storage
          ? { storage: convexAuthStorageProps.storage }
          : {})}
      >
        <UserCtx.UserProvider>
          <PushNotificationsProvider>
            <ActiveBusinessProvider>
              <AppModeProvider>
                <OnboardingProvider>
                  <RevenueCatProvider>
                    <RootErrorBoundary>
                      <WebAlertHost />
                      <WebPushLifecycle />
                      <PwaRuntime />
                      <Slot />
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
