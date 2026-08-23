import { Redirect, Slot, useLocalSearchParams, useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { BUSINESS_ROLES, useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function MerchantLayout() {
  const { user, isLoading, isAuthorized, isAuthenticated } =
    useRoleGuard(BUSINESS_ROLES);
  const segments = useSegments();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const segmentStrings = segments as string[];
  const isOnboardingRoute = segmentStrings.includes('onboarding');

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!isPreviewMode && user && user.customerOnboardedAt == null) {
    return <Redirect href="/(auth)/name-capture" />;
  }

  if (!user || !isAuthorized) {
    if (isPreviewMode) {
      return (
        <View style={styles.rtlRouteGroup}>
          <Slot />
        </View>
      );
    }
    if (user && isOnboardingRoute) {
      return (
        <View style={styles.rtlRouteGroup}>
          <Slot />
        </View>
      );
    }
    if (!user) {
      return (
        <Redirect
          href={isAuthenticated ? '/(auth)/name-capture' : '/(auth)/sign-up'}
        />
      );
    }
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return (
    <View style={styles.rtlRouteGroup}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  rtlRouteGroup: {
    ...rtlRouteContainerStyle,
  },
});
