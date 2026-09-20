import { useConvexAuth, useQuery } from 'convex/react';
import {
  type Href,
  Redirect,
  Stack,
  useLocalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import RedemptionCelebrationHost from '@/components/customer/RedemptionCelebrationHost';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  POST_AUTH_ROUTES,
  resolvePostAuthRoute,
} from '@/lib/auth/postAuthRouting';
import { savePendingJoin } from '@/lib/deeplink/pendingJoin';
import { isAdditionalBusinessFlow } from '@/lib/onboarding/businessOnboardingFlow';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { rtlScreenContentStyle } from '@/lib/rtl';

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { preview, map, biz, ref, bref, src, camp, flow } =
    useLocalSearchParams<{
      preview?: string;
      map?: string;
      biz?: string;
      ref?: string;
      bref?: string;
      src?: string;
      camp?: string;
      flow?: string;
    }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { appMode, syncAppMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId: resolvedActiveBusinessId } = useActiveBusiness();

  const shouldLoadUser = isAuthenticated || isPreviewMode;
  const user = useQuery(api.users.getCurrentUser, shouldLoadUser ? {} : 'skip');
  const sessionContext = useQuery(
    api.users.getSessionContext,
    shouldLoadUser ? {} : 'skip'
  );
  const resolvedAppMode = sessionContext?.activeMode ?? appMode;
  const shouldLoadDefaultBusinessOnboarding =
    isAuthenticated &&
    user?.customerOnboardedAt != null &&
    user.businessOnboardedAt == null;
  const defaultBusinessOnboardingDraft = useQuery(
    api.onboarding.getMyBusinessOnboardingDraft,
    shouldLoadDefaultBusinessOnboarding ? { flow: 'default' } : 'skip'
  );
  const isBusinessOnboardingLoading =
    shouldLoadDefaultBusinessOnboarding &&
    defaultBusinessOnboardingDraft === undefined;
  const hasInProgressBusinessOnboarding =
    defaultBusinessOnboardingDraft?.status === 'in_progress';
  const routingStatus = resolvePostAuthRoute({
    isAuthLoading: isLoading,
    isAuthenticated,
    user,
    sessionContext,
    activeBusinessId: resolvedActiveBusinessId,
    isBusinessOnboardingLoading,
    hasInProgressBusinessOnboarding,
  }).status;
  const router = useRouter();
  const segments = useSegments();
  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const isMerchantRoute = segmentStrings.includes('merchant');
  const isMerchantOnboardingRoute =
    segmentStrings.includes('merchant') &&
    segmentStrings.includes('onboarding');
  const isAdditionalMerchantOnboarding =
    isMerchantOnboardingRoute && isAdditionalBusinessFlow(flow);

  const lastRedirectRef = useRef<string | null>(null);
  const pendingJoinSaved = useRef(false);

  useEffect(() => {
    if (isPreviewMode) {
      return;
    }

    if (
      !isAuthenticated ||
      isAppModeLoading ||
      isLoading ||
      user === undefined ||
      sessionContext === undefined
    ) {
      return;
    }

    const currentSegments = (
      Array.isArray(segments) ? segments.filter(Boolean) : []
    ) as string[];
    const currentKey = `/${currentSegments.join('/')}`;
    if (
      lastRedirectRef.current &&
      !lastRedirectRef.current.startsWith(`${currentKey}=>`)
    ) {
      lastRedirectRef.current = null;
    }

    const inCard = currentSegments.includes('card');
    const inMerchant = currentSegments.includes('merchant');
    const inAdmin = currentSegments.includes('admin');
    const inJoin = currentSegments.includes('join');
    const inBusinessRecovery = currentSegments.includes('business-recovery');
    const inBusinessPermanentDeletion = currentSegments.includes(
      'business-permanent-deletion'
    );
    const inCustomerGroup = currentSegments.includes('(customer)');
    const inBusinessGroup = currentSegments.includes('(business)');
    const inStaffGroup = currentSegments.includes('(staff)');

    const isFreeRoute =
      inCard ||
      inMerchant ||
      inAdmin ||
      inJoin ||
      inBusinessRecovery ||
      inBusinessPermanentDeletion;

    const safeReplace = (href: string) => {
      const key = `${currentKey}=>${href}`;
      if (lastRedirectRef.current === key) {
        return;
      }
      lastRedirectRef.current = key;
      router.replace(href as Href);
    };

    const activeMode = sessionContext?.activeMode ?? 'customer';
    void syncAppMode(activeMode);

    const resolution = resolvePostAuthRoute({
      isAuthLoading: isLoading,
      isAuthenticated,
      user,
      sessionContext,
      activeBusinessId: resolvedActiveBusinessId,
      isBusinessOnboardingLoading,
      hasInProgressBusinessOnboarding,
    });

    if (resolution.status !== 'route') {
      return;
    }

    if (resolution.href === POST_AUTH_ROUTES.nameCapture) {
      safeReplace(POST_AUTH_ROUTES.nameCapture);
      return;
    }

    if (
      resolution.href === POST_AUTH_ROUTES.merchantOnboarding &&
      !inMerchant
    ) {
      safeReplace(POST_AUTH_ROUTES.merchantOnboarding);
      return;
    }

    if (resolution.href === POST_AUTH_ROUTES.businessDashboard) {
      if (
        inCustomerGroup ||
        inStaffGroup ||
        (inMerchant && !isAdditionalMerchantOnboarding)
      ) {
        safeReplace(POST_AUTH_ROUTES.businessDashboard);
      }
      return;
    }

    if (resolution.href === POST_AUTH_ROUTES.staffScanner) {
      if (!inStaffGroup && (!inMerchant || !isAdditionalMerchantOnboarding)) {
        safeReplace(POST_AUTH_ROUTES.staffScanner);
      }
      return;
    }

    if (
      resolution.href === POST_AUTH_ROUTES.customerWallet &&
      (activeMode === 'business' ||
        inBusinessGroup ||
        inStaffGroup ||
        (!inCustomerGroup && !inBusinessGroup && !inStaffGroup && !isFreeRoute))
    ) {
      safeReplace(POST_AUTH_ROUTES.customerWallet);
    }
  }, [
    isAuthenticated,
    isAppModeLoading,
    isLoading,
    router,
    segments,
    sessionContext,
    user,
    isPreviewMode,
    syncAppMode,
    resolvedActiveBusinessId,
    isAdditionalMerchantOnboarding,
    isBusinessOnboardingLoading,
    hasInProgressBusinessOnboarding,
  ]);

  useEffect(() => {
    if (!isAuthenticated && !isPreviewMode && !pendingJoinSaved.current) {
      if (!biz && !ref && !bref) {
        return;
      }
      pendingJoinSaved.current = true;
      void savePendingJoin({ biz, ref, bref, src, camp });
    }
  }, [isAuthenticated, isPreviewMode, biz, ref, bref, src, camp]);

  if (!isAuthenticated && !isPreviewMode && !isLoading) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  const shouldShowLoadingScreen =
    !isPreviewMode &&
    segmentStrings.length > 0 &&
    !isMerchantRoute &&
    !isMerchantOnboardingRoute &&
    (isLoading ||
      isAppModeLoading ||
      routingStatus === 'loading' ||
      (shouldLoadUser && (user === undefined || sessionContext === undefined)));

  if (shouldShowLoadingScreen) {
    return <FullScreenLoading />;
  }

  return (
    <View style={styles.shell}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: rtlScreenContentStyle,
        }}
      >
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(business)" />
        <Stack.Screen name="(staff)" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="join" />
        <Stack.Screen name="accept-invite" />
        <Stack.Screen name="business-recovery" />
        <Stack.Screen name="business-permanent-deletion" />
        <Stack.Screen name="card/index" />
        <Stack.Screen name="card/[membershipId]" />
      </Stack>
      {!isPreviewMode && isAuthenticated && resolvedAppMode === 'customer' ? (
        <RedemptionCelebrationHost />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
