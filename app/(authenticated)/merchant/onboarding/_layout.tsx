import { Redirect, Slot, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { useUser } from '@/contexts/UserContext';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function MerchantOnboardingLayout() {
  const { user, isLoading } = useUser();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });

  if (!isLoading && !user && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  if (!isPreviewMode && user?.customerOnboardedAt == null) {
    return <Redirect href="/(auth)/name-capture" />;
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
