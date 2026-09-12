import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CompactActivitySummaryRow } from '@/components/business-dashboard/CompactActivitySummaryRow';
import { DashboardHeader } from '@/components/business-dashboard/DashboardHeader';
import {
  type DatePresetKey,
  DateSelectorBar,
} from '@/components/business-dashboard/DateSelectorBar';
import { LifetimeMetricsRow } from '@/components/business-dashboard/LifetimeMetricsRow';
import { QuickShortcutsGrid } from '@/components/business-dashboard/QuickShortcutsGrid';
import {
  type DashboardRecommendation,
  getDashboardRecommendationKey,
  type RecommendationPendingActions,
  SmartRecommendationsPanel,
} from '@/components/business-dashboard/SmartRecommendationsPanel';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { getBusinessReferralDashboardCopy } from '@/lib/dashboard/businessReferralCopy';
import {
  isDashboardResponseForActiveBusiness,
  isRecommendationResponseForActiveBusiness,
} from '@/lib/dashboardBusinessIntegrity';
import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
  getDashboardLayoutMode,
} from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import {
  createRecommendationShownGuard,
  getRecommendationAnalyticsProps,
  safelyTrackRecommendationEvent,
} from '@/lib/recommendations/analytics';
import {
  type CurrentRecommendationInteractionState,
  executeCurrentRecommendationInteraction,
  isRecommendationInteractionRequestCurrent,
  openRecommendationAction,
} from '@/lib/recommendations/interaction';
import {
  alignItems,
  flexDirection,
  rtlBaseView,
  selfStart,
  tw,
} from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

const DAY_MS = 24 * 60 * 60 * 1000;
const NUMBER_FORMATTER = new Intl.NumberFormat('he-IL', {
  maximumFractionDigits: 0,
});

type BusinessRoute =
  | '/(authenticated)/(business)/scanner'
  | '/(authenticated)/(business)/campaigns'
  | '/(authenticated)/(business)/customers'
  | '/(authenticated)/(business)/programs'
  | '/(authenticated)/(business)/qr'
  | '/(authenticated)/(business)/settings'
  | '/(authenticated)/(business)/settings-business-profile'
  | '/(authenticated)/(business)/settings-business-invite-businesses'
  | '/(authenticated)/(business)/settings-business-subscription'
  | typeof BUSINESS_ROUTES.team;

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function getRangeDaysForPreset(preset: DatePresetKey) {
  if (preset === 'last_7_days') {
    return 7;
  }
  if (preset === 'last_30_days') {
    return 30;
  }
  return 1;
}

function getDayStartForPreset(
  preset: DatePresetKey,
  anchorNow: number
): number {
  if (preset === 'yesterday') {
    return anchorNow - DAY_MS;
  }
  return anchorNow;
}

class RecommendationQueryErrorBoundary extends Component<
  {
    children: ReactNode;
    layoutMode: DashboardLayoutMode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <SmartRecommendationsPanel
          layoutMode={this.props.layoutMode}
          status="error"
          primary={null}
          secondary={[]}
          onOpen={() => undefined}
          onSnooze={() => undefined}
          onDismiss={() => undefined}
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}

function DashboardBusinessReferralCard({
  activeBusinessId,
  isSwitchingBusiness,
  layoutMode,
  onOpen,
}: {
  activeBusinessId: Id<'businesses'>;
  isSwitchingBusiness: boolean;
  layoutMode: DashboardLayoutMode;
  onOpen: () => void;
}) {
  const summary = useQuery(
    api.referrals.getBusinessReferralCreditSummary,
    isSwitchingBusiness ? 'skip' : { businessId: activeBusinessId }
  );
  const isLoading = isSwitchingBusiness || summary == null;
  const copy = getBusinessReferralDashboardCopy(summary);
  const entranceProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((isReduceMotionEnabled) => {
        if (!isMounted) {
          return;
        }
        if (isReduceMotionEnabled) {
          entranceProgress.setValue(1);
          return;
        }
        Animated.timing(entranceProgress, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        if (isMounted) {
          entranceProgress.setValue(1);
        }
      });

    return () => {
      isMounted = false;
      entranceProgress.stopAnimation();
    };
  }, [entranceProgress]);

  return (
    <Animated.View
      style={[
        styles.businessReferralCard,
        layoutMode === 'tablet' ? styles.businessReferralCardTablet : null,
        {
          opacity: entranceProgress,
          transform: [
            {
              translateY: entranceProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [5, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.businessReferralContent}>
        <View style={styles.businessReferralIconArea}>
          <Ionicons name="gift-outline" size={22} color="#1D4ED8" />
          <View style={styles.businessReferralSparkleBadge}>
            <Ionicons name="sparkles" size={10} color="#6D28D9" />
          </View>
        </View>
        {isLoading ? (
          <View style={styles.businessReferralLoading}>
            <ActivityIndicator
              size="small"
              color={DASHBOARD_TOKENS.colors.brandBlue}
              accessibilityLabel="טוען סיכום הזמנת עסקים"
            />
            <Text style={styles.businessReferralLoadingText}>
              טוענים את מצב ההזמנות
            </Text>
          </View>
        ) : (
          <View style={styles.businessReferralCopy}>
            <Text style={styles.businessReferralTitle}>{copy.title}</Text>
            <Text style={styles.businessReferralBody}>
              {copy.supportingText}
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={onOpen}
        disabled={isSwitchingBusiness}
        accessibilityRole="button"
        accessibilityLabel="הזמנת עסק ל-StampAix"
        style={({ pressed }) => [
          styles.businessReferralButton,
          layoutMode === 'tablet'
            ? styles.businessReferralButtonTablet
            : null,
          pressed ? styles.businessReferralButtonPressed : null,
          isSwitchingBusiness
            ? styles.businessReferralButtonDisabled
            : null,
        ]}
      >
        <Text style={styles.businessReferralButtonText}>הזמנת עסק</Text>
      </Pressable>
    </Animated.View>
  );
}

function DashboardRecommendationsSection({
  activeBusinessId,
  isSwitchingBusiness,
  layoutMode,
}: {
  activeBusinessId: Id<'businesses'> | null;
  isSwitchingBusiness: boolean;
  layoutMode: DashboardLayoutMode;
}) {
  const router = useRouter();
  const [pendingActions, setPendingActions] =
    useState<RecommendationPendingActions>({});
  const inFlightRecommendationKeysRef = useRef(new Set<string>());
  const dismissConfirmationKeyRef = useRef<string | null>(null);
  const dismissRecommendation = useMutation(
    api.recommendations.dismissBusinessRecommendation
  );
  const snoozeRecommendation = useMutation(
    api.recommendations.snoozeBusinessRecommendation
  );
  const startRecommendationGuide = useMutation(
    api.recommendations.startBusinessRecommendationGuide
  );
  const recommendationShownGuardRef = useRef(createRecommendationShownGuard());
  const latestInteractionStateRef =
    useRef<CurrentRecommendationInteractionState>({
      activeBusinessId: null,
      isSwitchingBusiness: false,
      responseBusinessId: null,
      visibleRecommendations: [],
    });
  const recommendationResponse = useQuery(
    api.recommendations.getBusinessRecommendations,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const hasCurrentRecommendationResponse =
    recommendationResponse !== undefined &&
    recommendationResponse !== null &&
    isRecommendationResponseForActiveBusiness({
      responseBusinessId: recommendationResponse.businessId,
      activeBusinessId,
      isSwitchingBusiness,
    });
  const recommendationPrimary = hasCurrentRecommendationResponse
    ? (recommendationResponse.primary as DashboardRecommendation | null)
    : null;
  const recommendationSecondary = hasCurrentRecommendationResponse
    ? (recommendationResponse.secondary as DashboardRecommendation[])
    : [];
  const recommendationStatus =
    activeBusinessId && hasCurrentRecommendationResponse
      ? ('ready' as const)
      : ('loading' as const);
  latestInteractionStateRef.current = {
    activeBusinessId: activeBusinessId ? String(activeBusinessId) : null,
    isSwitchingBusiness,
    responseBusinessId:
      recommendationResponse?.businessId != null
        ? String(recommendationResponse.businessId)
        : null,
    visibleRecommendations: [
      ...(recommendationPrimary ? [recommendationPrimary] : []),
      ...recommendationSecondary,
    ].map((recommendation) => ({
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      guideId: recommendation.guideId,
      entityId: recommendation.entityId,
    })),
  };

  useEffect(() => {
    if (!activeBusinessId || !hasCurrentRecommendationResponse) {
      return;
    }
    const visibleRecommendations = [
      ...(recommendationPrimary ? [recommendationPrimary] : []),
      ...recommendationSecondary,
    ];
    for (const recommendation of visibleRecommendations) {
      if (
        recommendationShownGuardRef.current.shouldTrack({
          businessId: String(activeBusinessId),
          stableId: recommendation.stableId,
          evidenceFingerprint: recommendation.evidenceFingerprint,
        })
      ) {
        safelyTrackRecommendationEvent(
          track,
          ANALYTICS_EVENTS.recommendationShown,
          getRecommendationAnalyticsProps(recommendation)
        );
      }
    }
  }, [
    activeBusinessId,
    hasCurrentRecommendationResponse,
    recommendationPrimary,
    recommendationSecondary,
  ]);

  const beginRecommendationAction = (
    recommendation: DashboardRecommendation,
    type: 'open' | 'snooze' | 'dismiss'
  ) => {
    const key = getDashboardRecommendationKey(recommendation);
    if (inFlightRecommendationKeysRef.current.has(key)) {
      return null;
    }
    inFlightRecommendationKeysRef.current.add(key);
    setPendingActions((current) => ({ ...current, [key]: type }));
    return key;
  };

  const finishRecommendationAction = (key: string) => {
    inFlightRecommendationKeysRef.current.delete(key);
    setPendingActions((current) => {
      if (!(key in current)) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleOpen = async (recommendation: DashboardRecommendation) => {
    if (!activeBusinessId || isSwitchingBusiness) {
      return;
    }
    const openedBusinessId = String(activeBusinessId);
    const currentRequest = {
      businessId: openedBusinessId,
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      guideId: recommendation.guideId,
      ...(recommendation.entityId ? { entityId: recommendation.entityId } : {}),
    };
    if (
      !isRecommendationInteractionRequestCurrent(
        currentRequest,
        latestInteractionStateRef.current
      )
    ) {
      Alert.alert('', 'ההמלצה כבר התעדכנה.');
      return;
    }
    const pendingKey = beginRecommendationAction(recommendation, 'open');
    if (!pendingKey) {
      return;
    }
    try {
      const session = await startRecommendationGuide({
        businessId: openedBusinessId as Id<'businesses'>,
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
        evidenceFingerprint: recommendation.evidenceFingerprint,
      });
      const sessionMatches =
        String(session.businessId) === openedBusinessId &&
        session.stableId === recommendation.stableId &&
        session.guideId === recommendation.guideId &&
        session.evidenceFingerprint === recommendation.evidenceFingerprint &&
        String(session.entityId ?? '') ===
          String(recommendation.entityId ?? '') &&
        typeof session.guideSessionId === 'string' &&
        session.guideSessionId.length > 0 &&
        session.expiresAt > Date.now();
      if (
        !sessionMatches ||
        !isRecommendationInteractionRequestCurrent(
          currentRequest,
          latestInteractionStateRef.current
        )
      ) {
        throw new Error('STALE_RECOMMENDATION_GUIDE');
      }
      const result = openRecommendationAction({
        businessId: openedBusinessId,
        action: session.action,
        guideSessionId: session.guideSessionId,
        guideId: session.guideId,
        stableId: session.stableId,
        evidenceFingerprint: session.evidenceFingerprint,
        entityId: session.entityId,
        analyticsProps: getRecommendationAnalyticsProps(recommendation),
        trackEvent: track,
        navigate: (target) => router.push(target as never),
      });
      if (!result.ok) {
        throw new Error(`INVALID_RECOMMENDATION_NAVIGATION:${result.reason}`);
      }
    } catch (error) {
      const serializedError =
        error instanceof Error ? error.message : String(error);
      if (
        serializedError.includes('STALE_RECOMMENDATION_GUIDE') ||
        serializedError.includes('RECOMMENDATION_NOT_ACTIONABLE')
      ) {
        Alert.alert('', 'ההמלצה כבר התעדכנה. נסו שוב.');
      } else {
        Alert.alert(
          'לא הצלחנו לפתוח את הפעולה',
          'ההמלצה נשארה זמינה. נסו שוב.'
        );
      }
    } finally {
      finishRecommendationAction(pendingKey);
    }
  };

  const performInteraction = async (
    recommendation: DashboardRecommendation,
    action: 'dismiss' | 'snooze'
  ) => {
    if (!activeBusinessId || isSwitchingBusiness) {
      return;
    }
    const openedBusinessId = String(activeBusinessId);
    const pendingKey = beginRecommendationAction(recommendation, action);
    if (!pendingKey) {
      return;
    }
    await executeCurrentRecommendationInteraction({
      request: {
        businessId: openedBusinessId,
        stableId: recommendation.stableId,
        evidenceFingerprint: recommendation.evidenceFingerprint,
        guideId: recommendation.guideId,
        ...(recommendation.entityId
          ? { entityId: recommendation.entityId }
          : {}),
      },
      getCurrentState: () => latestInteractionStateRef.current,
      mutate: async () => {
        const args = {
          businessId: openedBusinessId as Id<'businesses'>,
          stableId: recommendation.stableId,
          evidenceFingerprint: recommendation.evidenceFingerprint,
        };
        return action === 'dismiss'
          ? await dismissRecommendation(args)
          : await snoozeRecommendation(args);
      },
      onSuccess: (result) => {
        safelyTrackRecommendationEvent(
          track,
          action === 'dismiss'
            ? ANALYTICS_EVENTS.recommendationDismissed
            : ANALYTICS_EVENTS.recommendationSnoozed,
          {
            ...getRecommendationAnalyticsProps(recommendation),
            reason_code: result.reasonCode,
          }
        );
      },
      onStale: () => {
        Alert.alert('', 'ההמלצה כבר התעדכנה.');
      },
      onError: () => {
        Alert.alert('לא הצלחנו לעדכן', 'ההמלצה נשארה מוצגת. נסו שוב.');
      },
      onSettled: () => finishRecommendationAction(pendingKey),
    });
  };

  const handleSnooze = (recommendation: DashboardRecommendation) => {
    void performInteraction(recommendation, 'snooze');
  };

  const handleDismiss = (recommendation: DashboardRecommendation) => {
    if (!activeBusinessId || isSwitchingBusiness) {
      return;
    }
    const key = getDashboardRecommendationKey(recommendation);
    if (
      inFlightRecommendationKeysRef.current.has(key) ||
      dismissConfirmationKeyRef.current === key
    ) {
      return;
    }
    dismissConfirmationKeyRef.current = key;
    const clearConfirmation = () => {
      if (dismissConfirmationKeyRef.current === key) {
        dismissConfirmationKeyRef.current = null;
      }
    };
    Alert.alert(
      'הסרת ההמלצה',
      'ההמלצה תוסר מרשימת הפעולות בהתאם למחזור ההמלצות.',
      [
        {
          text: 'ביטול',
          style: 'cancel',
          onPress: clearConfirmation,
        },
        {
          text: 'הסרה',
          style: 'destructive',
          onPress: () => {
            clearConfirmation();
            void performInteraction(recommendation, 'dismiss');
          },
        },
      ],
      { cancelable: true, onDismiss: clearConfirmation }
    );
  };

  return (
    <SmartRecommendationsPanel
      layoutMode={layoutMode}
      status={recommendationStatus}
      primary={recommendationPrimary}
      secondary={recommendationSecondary}
      pendingActions={pendingActions}
      onOpen={handleOpen}
      onSnooze={handleSnooze}
      onDismiss={handleDismiss}
    />
  );
}

export default function BusinessDashboardScreen() {
  const { width } = useWindowDimensions();
  const layoutMode = getDashboardLayoutMode(width);
  const layout = getDashboardLayout(layoutMode);
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const sessionContext = useSessionContext();
  const {
    activeBusinessId,
    activeBusiness,
    isLoading: isBusinessLoading,
    isSwitchingBusiness,
  } = useActiveBusiness();
  const { entitlements, gate, limitStatus } = useEntitlements(activeBusinessId);
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canInviteBusinesses =
    activeBusinessCapabilities?.invite_businesses === true;
  const teamGate = gate('team');
  const [selectedDayStart, setSelectedDayStart] = useState(() => Date.now());
  const [selectedPreset, setSelectedPreset] = useState<DatePresetKey>('today');

  const dashboardSummary = useQuery(
    api.dashboard.getBusinessDashboardSummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const dashboardDay = useQuery(
    api.dashboard.getBusinessDashboardDay,
    activeBusinessId
      ? {
          businessId: activeBusinessId,
          dayStart: selectedDayStart,
          rangeDays: getRangeDaysForPreset(selectedPreset),
        }
      : 'skip'
  );
  const recentActivity = useQuery(
    api.events.getRecentActivity,
    activeBusinessId ? { businessId: activeBusinessId, limit: 5 } : 'skip'
  );
  const teamSummary = useQuery(
    api.business.getBusinessTeamSummary,
    activeBusinessId && entitlements && !teamGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  ) as { usedSeats: number; maxSeats: number } | null | undefined;

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const dashboardResponseBusinessId =
    dashboardSummary?.businessId ??
    dashboardSummary?.business?.businessId ??
    null;
  const hasCurrentBusinessDashboardSummary =
    dashboardSummary !== undefined &&
    dashboardSummary !== null &&
    isDashboardResponseForActiveBusiness({
      responseBusinessId: dashboardResponseBusinessId,
      activeBusinessId,
      isSwitchingBusiness,
    });
  const currentDashboardSummary = hasCurrentBusinessDashboardSummary
    ? dashboardSummary
    : null;
  const anchorNow =
    currentDashboardSummary?.freshness?.generatedAt ?? Date.now();
  const businessName =
    currentDashboardSummary?.business?.businessName?.trim() ||
    activeBusiness?.name?.trim() ||
    'העסק שלך';
  const currentUser = sessionContext?.user;
  const displayName =
    currentUser?.firstName?.trim() ||
    currentUser?.fullName?.trim()?.split(/\s+/)[0] ||
    [currentUser?.firstName?.trim(), currentUser?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    businessName;

  const lifetimeMetrics = currentDashboardSummary?.lifetimeMetrics;
  const kpis = dashboardDay?.kpis;
  const selectedPeriodLabel =
    selectedPreset === 'today'
      ? 'היום'
      : selectedPreset === 'last_7_days'
        ? '7 ימים'
        : selectedPreset === 'last_30_days'
          ? '30 ימים'
          : 'אתמול';
  const formatPeriodDelta = (value: number) => ({
    amount: `+${formatNumber(Math.max(0, value))}`,
    period: selectedPeriodLabel,
  });
  const formatPeriodActiveCustomers = (value: number) => ({
    amount: `${formatNumber(Math.max(0, value))} פעילים`,
    period: selectedPeriodLabel,
  });
  const unifiedKpiItems = [
    {
      key: 'total_customers',
      label: 'סה״כ לקוחות',
      value: formatNumber(lifetimeMetrics?.totalCustomersJoinedAllTime ?? 0),
      icon: 'shield-checkmark-outline' as const,
      tone: 'amber' as const,
      helperValue: formatPeriodActiveCustomers(kpis?.activeCustomers ?? 0),
    },
    {
      key: 'lifetime_stamps',
      label: 'חותמות',
      value: formatNumber(lifetimeMetrics?.totalStampsAllTime ?? 0),
      icon: 'stamp-outline-custom' as const,
      tone: 'blue' as const,
      helperValue: formatPeriodDelta(kpis?.stamps?.value ?? 0),
    },
    {
      key: 'lifetime_redemptions',
      label: 'הטבות',
      value: formatNumber(lifetimeMetrics?.totalRedemptionsAllTime ?? 0),
      icon: 'gift-outline-custom' as const,
      tone: 'violet' as const,
      helperValue: formatPeriodDelta(kpis?.redemptions?.value ?? 0),
    },
  ];

  const openRoute = (route: BusinessRoute) => router.push(route as never);
  const teamSeatStatus = teamSummary
    ? limitStatus('maxTeamSeats', teamSummary.usedSeats)
    : null;
  const isTeamSeatLimitReached = teamSeatStatus?.isAtLimit === true;
  const teamSeatRequiredPlan =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxTeamSeats ?? null;
  const openTeamShortcut = () => {
    if (teamGate.isLocked) {
      openSubscriptionComparison(router, {
        featureKey: 'team',
        requiredPlan: teamGate.requiredPlan,
        reason:
          teamGate.reason === 'subscription_inactive'
            ? 'subscription_inactive'
            : 'feature_locked',
      });
      return;
    }
    if (isTeamSeatLimitReached) {
      openSubscriptionComparison(router, {
        featureKey: 'maxTeamSeats',
        requiredPlan: teamSeatRequiredPlan,
        reason: 'limit_reached',
      });
      return;
    }
    openRoute(BUSINESS_ROUTES.team);
  };

  const handleSelectPreset = (preset: DatePresetKey) => {
    setSelectedPreset(preset);
    setSelectedDayStart(getDayStartForPreset(preset, anchorNow));
  };

  if (isAppModeLoading || isBusinessLoading) {
    return <FullScreenLoading />;
  }
  if (!activeBusinessId && !isPreviewMode) {
    return <FullScreenLoading />;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.pageHorizontalPadding,
            gap: layout.sectionGap,
          },
        ]}
      >
        <DashboardHeader
          layoutMode={layoutMode}
          displayName={displayName}
          businessName={businessName}
          avatarUrl={currentUser?.avatarUrl ?? null}
          onPressMenu={() => openRoute('/(authenticated)/(business)/settings')}
        />

        <View style={styles.section}>
          <View style={styles.recommendationsTitleRow}>
            <Ionicons
              name="sparkles-outline"
              size={18}
              color={DASHBOARD_TOKENS.colors.brandBlue}
            />
            <Text
              className={tw.textStart}
              style={[
                styles.sectionTitle,
                styles.recommendationsSectionTitle,
                {
                  fontSize: layout.sectionTitleSize,
                  lineHeight: layout.sectionTitleLineHeight,
                },
              ]}
            >
              מומלץ עכשיו
            </Text>
          </View>
          <RecommendationQueryErrorBoundary
            key={String(activeBusinessId ?? 'preview')}
            layoutMode={layoutMode}
          >
            <DashboardRecommendationsSection
              activeBusinessId={activeBusinessId}
              isSwitchingBusiness={isSwitchingBusiness}
              layoutMode={layoutMode}
            />
          </RecommendationQueryErrorBoundary>
        </View>

        {activeBusinessId && canInviteBusinesses ? (
          <DashboardBusinessReferralCard
            key={String(activeBusinessId)}
            activeBusinessId={activeBusinessId}
            isSwitchingBusiness={isSwitchingBusiness}
            layoutMode={layoutMode}
            onOpen={() =>
              openRoute(
                '/(authenticated)/(business)/settings-business-invite-businesses'
              )
            }
          />
        ) : null}

        <View style={styles.section}>
          <Text
            className={tw.textStart}
            style={[
              styles.sectionTitle,
              {
                fontSize: layout.sectionTitleSize,
                lineHeight: layout.sectionTitleLineHeight,
              },
            ]}
          >
            תמונת מצב
          </Text>
          <DateSelectorBar
            layoutMode={layoutMode}
            value={selectedPreset}
            onChange={handleSelectPreset}
          />
          <LifetimeMetricsRow
            layoutMode={layoutMode}
            metrics={unifiedKpiItems}
          />
        </View>

        {Array.isArray(recentActivity) && recentActivity.length > 0 ? (
          <View style={styles.section}>
            <Text
              className={tw.textStart}
              style={[
                styles.sectionTitle,
                {
                  fontSize: layout.sectionTitleSize,
                  lineHeight: layout.sectionTitleLineHeight,
                },
              ]}
            >
              פעילות אחרונה
            </Text>
            <CompactActivitySummaryRow
              layoutMode={layoutMode}
              items={recentActivity.map(
                (item: {
                  id: unknown;
                  type?: unknown;
                  customer?: unknown;
                  detail?: unknown;
                  time?: unknown;
                }) => ({
                  key: String(item.id),
                  type: item.type === 'reward' ? 'reward' : 'punch',
                  customer: String(item.customer ?? 'לקוח'),
                  detail: String(item.detail ?? ''),
                  time: String(item.time ?? ''),
                })
              )}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text
            className={tw.textStart}
            style={[
              styles.sectionTitle,
              {
                fontSize: layout.sectionTitleSize,
                lineHeight: layout.sectionTitleLineHeight,
              },
            ]}
          >
            פעולות מהירות
          </Text>
          <QuickShortcutsGrid
            layoutMode={layoutMode}
            items={[
              {
                key: 'scanner',
                label: 'סריקת לקוח',
                icon: 'scan-outline',
                onPress: () => openRoute('/(authenticated)/(business)/scanner'),
              },
              {
                key: 'join-qr',
                label: 'צרפו לקוחות',
                icon: 'qr-code-outline',
                onPress: () => openRoute('/(authenticated)/(business)/qr'),
              },
              {
                key: 'team',
                label: 'הוספת עובד',
                icon: teamGate.isLocked
                  ? 'lock-closed-outline'
                  : 'person-add-outline',
                badgeLabel: teamGate.isLocked
                  ? 'נעול'
                  : isTeamSeatLimitReached
                    ? 'מלא'
                    : undefined,
                isLocked: teamGate.isLocked || isTeamSeatLimitReached,
                onPress: openTeamShortcut,
              },
            ]}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
    ...rtlBaseView,
  },
  scroll: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
    ...rtlBaseView,
  },
  content: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    paddingHorizontal: DASHBOARD_TOKENS.spacingPageHorizontal,
    paddingTop: 2,
    paddingBottom: 124,
    gap: 22,
    ...rtlBaseView,
  },
  section: {
    gap: 10,
    ...rtlBaseView,
  },
  sectionTitle: {
    fontSize: DASHBOARD_TOKENS.typography.sectionTitle.fontSize,
    lineHeight: DASHBOARD_TOKENS.typography.sectionTitle.lineHeight,
    fontWeight: DASHBOARD_TOKENS.typography.sectionTitle.fontWeight,
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  recommendationsSectionTitle: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  recommendationsTitleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    alignSelf: selfStart,
    gap: 6,
    ...rtlBaseView,
  },
  businessReferralCard: {
    minHeight: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C7D8FF',
    backgroundColor: '#F3F6FF',
    padding: 11,
    gap: 8,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    ...rtlBaseView,
  },
  businessReferralCardTablet: {
    minHeight: 84,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  businessReferralContent: {
    flex: 1,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  businessReferralIconArea: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 22,
    backgroundColor: '#DDE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessReferralSparkleBadge: {
    position: 'absolute',
    top: -3,
    left: -2,
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#F3F6FF',
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessReferralCopy: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: alignItems.start,
    ...rtlBaseView,
  },
  businessReferralTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  businessReferralBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  businessReferralLoading: {
    flex: 1,
    minHeight: 44,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...rtlBaseView,
  },
  businessReferralLoadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  businessReferralButton: {
    minHeight: 44,
    width: '100%',
    borderRadius: 12,
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessReferralButtonTablet: {
    width: 'auto',
    minWidth: 118,
  },
  businessReferralButtonPressed: {
    opacity: 0.86,
  },
  businessReferralButtonDisabled: {
    opacity: 0.55,
  },
  businessReferralButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
