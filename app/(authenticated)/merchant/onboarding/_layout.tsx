import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, Slot, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import { resolvePostAuthRoute } from '@/lib/auth/postAuthRouting';
import { isAdditionalBusinessFlow } from '@/lib/onboarding/businessOnboardingFlow';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function MerchantOnboardingLayout() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { user, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const { preview, map, flow } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    flow?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const isAdditionalFlow = isAdditionalBusinessFlow(flow);
  const shouldLoadDefaultBusinessOnboardingDraft =
    !isAdditionalFlow &&
    !isPreviewMode &&
    isAuthenticated &&
    user?.customerOnboardedAt != null &&
    user.businessOnboardedAt == null;
  const defaultBusinessOnboardingDraft = useQuery(
    api.onboarding.getMyBusinessOnboardingDraft,
    shouldLoadDefaultBusinessOnboardingDraft ? { flow: 'default' } : 'skip'
  );
  const isDefaultBusinessOnboardingDraftLoading =
    shouldLoadDefaultBusinessOnboardingDraft &&
    defaultBusinessOnboardingDraft === undefined;
  const isRoutingLoading =
    isAuthLoading ||
    isUserLoading ||
    sessionContext === undefined ||
    (user !== null && sessionContext === null) ||
    isDefaultBusinessOnboardingDraftLoading;
  const enteredWithCompletedBusinessRef = useRef<boolean | null>(null);

  if (enteredWithCompletedBusinessRef.current === null && !isRoutingLoading) {
    enteredWithCompletedBusinessRef.current =
      user?.businessOnboardedAt != null;
  }

  if (isRoutingLoading) {
    return <FullScreenLoading />;
  }

  if (!user && !isPreviewMode) {
    return (
      <Redirect
        href={isAuthenticated ? '/(auth)/name-capture' : '/(auth)/sign-up'}
      />
    );
  }

  if (!isPreviewMode && user && user.customerOnboardedAt == null) {
    return <Redirect href="/(auth)/name-capture" />;
  }

  if (
    !isPreviewMode &&
    enteredWithCompletedBusinessRef.current === true &&
    !isAdditionalFlow
  ) {
    const resolution = resolvePostAuthRoute({
      isAuthLoading: false,
      isAuthenticated,
      user,
      sessionContext,
    });

    if (resolution.status === 'loading') {
      return <FullScreenLoading />;
    }

    if (resolution.status === 'route') {
      return <Redirect href={resolution.href} />;
    }
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
