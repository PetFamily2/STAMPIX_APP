import { useConvexAuth, useQuery } from 'convex/react';
import {
  type Href,
  Redirect,
  Stack,
  useLocalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { IS_DEV_MODE } from '@/config/appConfig';
import { STAMPAIX_IMAGE_LOGO } from '@/config/branding';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  getActiveMembershipByBusinessId,
  requiresBusinessOnboardingForRole,
  resolveActiveBusinessShell,
} from '@/lib/activeBusinessShell';
import { savePendingJoin } from '@/lib/deeplink/pendingJoin';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  loadingTitle:
    '\u05d1\u05d5\u05e0\u05d4 \u05dc\u05da \u05d7\u05d5\u05d5\u05d9\u05d4 \u05de\u05d5\u05ea\u05d0\u05de\u05ea',
  loadingSubtitleCustomer:
    '\u05db\u05de\u05d4 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d5\u05e0\u05db\u05e0\u05e1\u05d9\u05dd \u05dc\u05d0\u05e8\u05e0\u05e7 \u05e9\u05dc\u05da',
  loadingSubtitleBusiness:
    '\u05db\u05de\u05d4 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d5\u05e0\u05db\u05e0\u05e1\u05d9\u05dd \u05dc\u05de\u05e8\u05db\u05d6 \u05d4\u05e0\u05d9\u05d4\u05d5\u05dc',
  loadingSubtitleStaff:
    '\u05db\u05de\u05d4 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d5\u05e0\u05db\u05e0\u05e1\u05d9\u05dd \u05dc\u05e1\u05d5\u05e8\u05e7 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  loadingSubtitleBusinessOnboarding:
    '\u05db\u05de\u05d4 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d5\u05de\u05de\u05e9\u05d9\u05db\u05d9\u05dd \u05dc\u05d4\u05d2\u05d3\u05e8\u05ea \u05d4\u05e2\u05e1\u05e7',
  loadingSubtitleDefault:
    '\u05db\u05de\u05d4 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d5\u05e0\u05db\u05e0\u05e1\u05d9\u05dd \u05dc\u05d7\u05e9\u05d1\u05d5\u05df \u05e9\u05dc\u05da',
};

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { preview, map, biz, src, camp } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    biz?: string;
    src?: string;
    camp?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, syncAppMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId: resolvedActiveBusinessId } = useActiveBusiness();

  const shouldLoadUser = isAuthenticated || isPreviewMode;
  const user = useQuery(api.users.getCurrentUser, shouldLoadUser ? {} : 'skip');
  const sessionContext = useQuery(
    api.users.getSessionContext,
    shouldLoadUser ? {} : 'skip'
  );
  const router = useRouter();
  const segments = useSegments();
  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const isMerchantRoute = segmentStrings.includes('merchant');
  const isMerchantOnboardingRoute =
    segmentStrings.includes('merchant') &&
    segmentStrings.includes('onboarding');

  const lastRedirectRef = useRef<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoadingPhaseDone, setIsLoadingPhaseDone] = useState(false);
  const pendingJoinSaved = useRef(false);
  const loadingPhaseStarted = useRef(false);

  const isBootstrapDataReady =
    !isLoading &&
    (isPreviewMode || !isAppModeLoading) &&
    (shouldLoadUser
      ? user !== undefined && sessionContext !== undefined
      : true);

  useEffect(() => {
    if (isPreviewMode || !isAuthenticated || isLoadingPhaseDone) {
      return;
    }

    if (!loadingPhaseStarted.current) {
      loadingPhaseStarted.current = true;
      setLoadingProgress(0);
    }

    const target = isBootstrapDataReady ? 100 : 92;
    const timer = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= target) {
          return prev;
        }
        const remaining = target - prev;
        const step = remaining > 30 ? 4 : remaining > 15 ? 3 : 2;
        return Math.min(target, prev + step);
      });
    }, 55);

    return () => clearInterval(timer);
  }, [
    isAuthenticated,
    isBootstrapDataReady,
    isLoadingPhaseDone,
    isPreviewMode,
  ]);

  useEffect(() => {
    if (
      isPreviewMode ||
      !isAuthenticated ||
      !isBootstrapDataReady ||
      loadingProgress < 100 ||
      isLoadingPhaseDone
    ) {
      return;
    }

    const doneTimer = setTimeout(() => {
      setIsLoadingPhaseDone(true);
    }, 180);

    return () => clearTimeout(doneTimer);
  }, [
    isAuthenticated,
    isBootstrapDataReady,
    isLoadingPhaseDone,
    isPreviewMode,
    loadingProgress,
  ]);

  useEffect(() => {
    if (isPreviewMode) {
      return;
    }

    if (
      !isAuthenticated ||
      isAppModeLoading ||
      isLoading ||
      !isLoadingPhaseDone ||
      user === undefined ||
      sessionContext === undefined
    ) {
      return;
    }

    const currentSegments = (
      Array.isArray(segments) ? segments.filter(Boolean) : []
    ) as string[];
    const currentKey = `/${currentSegments.join('/')}`;

    const inCard = currentSegments.includes('card');
    const inMerchant = currentSegments.includes('merchant');
    const inAdmin = currentSegments.includes('admin');
    const inJoin = currentSegments.includes('join');
    const inCustomerGroup = currentSegments.includes('(customer)');
    const inBusinessGroup = currentSegments.includes('(business)');
    const inStaffGroup = currentSegments.includes('(staff)');

    const isFreeRoute = inCard || inMerchant || inAdmin || inJoin;

    const safeReplace = (href: string) => {
      const key = `${currentKey}=>${href}`;
      if (lastRedirectRef.current === key) {
        return;
      }
      lastRedirectRef.current = key;
      router.replace(href as Href);
    };

    const customerTarget = '/(authenticated)/(customer)/wallet';
    const businessTarget = '/(authenticated)/(business)/dashboard';
    const staffTarget = '/(authenticated)/(staff)/scanner';
    const merchantOnboardingTarget = BUSINESS_ONBOARDING_ROUTES.entry;
    const nameCaptureTarget = '/(auth)/name-capture';

    const customerOnboarded = user?.customerOnboardedAt != null;
    const businessOnboarded = user?.businessOnboardedAt != null;
    const activeMode = sessionContext?.activeMode ?? 'customer';
    const bizList = sessionContext?.businesses ?? [];
    const activeBusinessId =
      resolvedActiveBusinessId ?? sessionContext?.activeBusinessId ?? null;
    const activeMembership = getActiveMembershipByBusinessId(
      bizList,
      activeBusinessId
    );
    const activeMembershipRole = activeMembership?.staffRole ?? null;
    const activeShell = resolveActiveBusinessShell(bizList, activeBusinessId);
    const shouldForceBusinessOnboarding =
      activeMode === 'business' &&
      requiresBusinessOnboardingForRole(
        activeMembershipRole,
        businessOnboarded
      );

    void syncAppMode(activeMode);

    if (!customerOnboarded) {
      safeReplace(nameCaptureTarget);
      return;
    }

    if (shouldForceBusinessOnboarding && !inMerchant) {
      safeReplace(merchantOnboardingTarget);
      return;
    }

    if (activeMode === 'business') {
      if (activeShell === 'none') {
        safeReplace(customerTarget);
        return;
      }
      if (
        activeShell === 'business' &&
        requiresBusinessOnboardingForRole(
          activeMembershipRole,
          businessOnboarded
        ) &&
        !inMerchant
      ) {
        safeReplace(merchantOnboardingTarget);
        return;
      }
      if (activeShell === 'business') {
        if (inCustomerGroup || inStaffGroup) {
          safeReplace(businessTarget);
          return;
        }
        return;
      }
      if (inCustomerGroup || inBusinessGroup) {
        safeReplace(staffTarget);
        return;
      }
      if (!inStaffGroup) {
        safeReplace(staffTarget);
        return;
      }
      return;
    }

    if (activeMode === 'customer') {
      if (inBusinessGroup || inStaffGroup) {
        safeReplace(customerTarget);
        return;
      }
    }

    if (!inCustomerGroup && !inBusinessGroup && !inStaffGroup && !isFreeRoute) {
      safeReplace(customerTarget);
    }
  }, [
    isAuthenticated,
    isAppModeLoading,
    isLoading,
    isLoadingPhaseDone,
    router,
    segments,
    sessionContext,
    user,
    isPreviewMode,
    syncAppMode,
    resolvedActiveBusinessId,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated &&
      !isPreviewMode &&
      biz &&
      !pendingJoinSaved.current
    ) {
      pendingJoinSaved.current = true;
      void savePendingJoin({ biz, src, camp });
    }
  }, [isAuthenticated, isPreviewMode, biz, src, camp]);

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
      (shouldLoadUser &&
        (user === undefined || sessionContext === undefined)) ||
      (isAuthenticated && !isLoadingPhaseDone));

  const loadingSubtitle = (() => {
    if (sessionContext == null || user == null) {
      return appMode === 'business'
        ? TEXT.loadingSubtitleBusiness
        : TEXT.loadingSubtitleCustomer;
    }

    if (user.customerOnboardedAt == null) {
      return TEXT.loadingSubtitleDefault;
    }

    const activeMode = sessionContext.activeMode ?? appMode;
    if (activeMode === 'business') {
      const businesses = sessionContext.businesses ?? [];
      const activeBusinessId =
        resolvedActiveBusinessId ?? sessionContext.activeBusinessId ?? null;
      const activeMembership = getActiveMembershipByBusinessId(
        businesses,
        activeBusinessId
      );
      const activeMembershipRole = activeMembership?.staffRole ?? null;

      if (!activeMembershipRole) {
        return TEXT.loadingSubtitleDefault;
      }

      if (activeMembershipRole === 'staff') {
        return TEXT.loadingSubtitleStaff;
      }

      return requiresBusinessOnboardingForRole(
        activeMembershipRole,
        user.businessOnboardedAt != null
      )
        ? TEXT.loadingSubtitleBusinessOnboarding
        : TEXT.loadingSubtitleBusiness;
    }

    return TEXT.loadingSubtitleCustomer;
  })();

  if (shouldShowLoadingScreen) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingHero}>
          <View style={styles.loadingLogoHalo} />
          <View style={styles.loadingLogoShell}>
            <Image
              source={STAMPAIX_IMAGE_LOGO}
              style={styles.loadingLogo}
              resizeMode="contain"
              accessibilityLabel="StampAix logo"
            />
          </View>
          <View style={styles.loadingPercentBadge}>
            <Text style={styles.loadingPercent}>
              {Math.min(100, loadingProgress)}%
            </Text>
          </View>
        </View>
        <Text style={styles.loadingTitle}>{TEXT.loadingTitle}</Text>
        <Text style={styles.loadingSubtitle}>{loadingSubtitle}</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(business)" />
      <Stack.Screen name="(staff)" />
      <Stack.Screen name="join" />
      <Stack.Screen name="accept-invite" />
      <Stack.Screen name="card/index" />
      <Stack.Screen name="card/[membershipId]" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#FDFDFD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingHero: {
    width: 248,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  loadingLogoHalo: {
    position: 'absolute',
    top: 4,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#EAF1FF',
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  loadingLogoShell: {
    width: 208,
    height: 208,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  loadingLogo: {
    width: 172,
    height: 172,
  },
  loadingPercentBadge: {
    marginTop: -18,
    minWidth: 114,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F57E7',
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  loadingPercent: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 40,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  loadingTitle: {
    marginTop: 4,
    fontSize: 34,
    fontWeight: '900',
    color: '#0F2A4D',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  loadingSubtitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#5C6779',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
