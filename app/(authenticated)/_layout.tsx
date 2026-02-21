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
import { StyleSheet, Text, View } from 'react-native';

import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { savePendingJoin } from '@/lib/deeplink/pendingJoin';

const TEXT = {
  loadingTitle:
    '\u05d1\u05d5\u05e0\u05d4 \u05dc\u05da \u05d7\u05d5\u05d5\u05d9\u05d4 \u05de\u05d5\u05ea\u05d0\u05de\u05ea',
  loadingSubtitle:
    '\u05db\u05de\u05d4 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d5\u05e0\u05db\u05e0\u05e1\u05d9\u05dd \u05dc\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3',
};

function hasCapturedName(user: { firstName?: string; lastName?: string }) {
  return Boolean(user.firstName?.trim().length && user.lastName?.trim().length);
}

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
  const {
    appMode,
    setAppMode,
    hasSelectedMode,
    isLoading: isAppModeLoading,
  } = useAppMode();

  const shouldLoadUser = isAuthenticated || isPreviewMode;
  const user = useQuery(api.users.getCurrentUser, shouldLoadUser ? {} : 'skip');
  const sessionContext = useQuery(
    api.users.getSessionContext,
    shouldLoadUser ? {} : 'skip'
  );
  const router = useRouter();
  const segments = useSegments();

  const lastRedirectRef = useRef<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoadingPhaseDone, setIsLoadingPhaseDone] = useState(false);
  const pendingJoinSaved = useRef(false);
  const loadingPhaseStarted = useRef(false);

  const isBootstrapDataReady =
    !isLoading &&
    (isPreviewMode || !isAppModeLoading) &&
    (shouldLoadUser ? user !== undefined : true);

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
      !isLoadingPhaseDone
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
    const nameCaptureTarget = '/(auth)/name-capture';

    const bizList = sessionContext?.businesses ?? [];
    const hasOwnerOrManager = bizList.some(
      (b) => b.staffRole === 'owner' || b.staffRole === 'manager'
    );
    const hasAnyBizAccess = bizList.length > 0;

    if (!hasSelectedMode && sessionContext?.defaultMode) {
      void setAppMode(sessionContext.defaultMode);
    }

    if (user) {
      const needsNameCapture =
        user.postAuthOnboardingRequired === true &&
        (user.needsNameCapture === true || !hasCapturedName(user));
      if (needsNameCapture) {
        safeReplace(nameCaptureTarget);
        return;
      }
    }

    if (appMode === 'business' && inCustomerGroup && hasOwnerOrManager) {
      safeReplace(businessTarget);
      return;
    }
    if (appMode === 'business' && !hasOwnerOrManager) {
      if (hasAnyBizAccess) {
        void setAppMode('staff');
        safeReplace(staffTarget);
      } else {
        void setAppMode('customer');
        safeReplace(customerTarget);
      }
      return;
    }
    if (appMode === 'staff' && inCustomerGroup && hasAnyBizAccess) {
      safeReplace(staffTarget);
      return;
    }
    if (appMode === 'staff' && !hasAnyBizAccess) {
      void setAppMode('customer');
      safeReplace(customerTarget);
      return;
    }
    if (appMode === 'customer' && inBusinessGroup) {
      safeReplace(customerTarget);
      return;
    }
    if (appMode === 'customer' && inStaffGroup) {
      safeReplace(customerTarget);
      return;
    }
    if (!inCustomerGroup && !inBusinessGroup && !inStaffGroup && !isFreeRoute) {
      const target =
        appMode === 'business' && hasOwnerOrManager
          ? businessTarget
          : appMode === 'staff' && hasAnyBizAccess
            ? staffTarget
            : customerTarget;
      safeReplace(target);
    }
  }, [
    appMode,
    hasSelectedMode,
    sessionContext,
    isAppModeLoading,
    isAuthenticated,
    isLoading,
    isLoadingPhaseDone,
    router,
    setAppMode,
    segments,
    isPreviewMode,
    user,
  ]);

  // Save deep link join params before auth redirect so we can complete the
  // join after auth.
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
    (isLoading ||
      isAppModeLoading ||
      (shouldLoadUser && user === undefined) ||
      (isAuthenticated && !isLoadingPhaseDone));

  if (shouldShowLoadingScreen) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingPercent}>
          {Math.min(100, loadingProgress)}%
        </Text>
        <Text style={styles.loadingTitle}>{TEXT.loadingTitle}</Text>
        <Text style={styles.loadingSubtitle}>{TEXT.loadingSubtitle}</Text>
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
    backgroundColor: '#ECECEC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingPercent: {
    fontSize: 84,
    fontWeight: '900',
    color: '#2F6BFF',
    lineHeight: 92,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  loadingTitle: {
    marginTop: 8,
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
