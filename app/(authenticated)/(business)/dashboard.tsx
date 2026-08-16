import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { DASHBOARD_CUSTOMER_NAV_LABELS } from '@/lib/dashboard/navigationCopy';
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
  justifyContent,
  rtlBaseView,
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
  | '/(authenticated)/(business)/analytics'
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
  const creditedMonths = summary?.creditedMonths;
  const pendingMonths = summary?.pendingMonths;
  const hasCreditStatus =
    (creditedMonths != null && creditedMonths > 0) ||
    (pendingMonths != null && pendingMonths > 0);

  return (
    <View
      style={[
        styles.businessReferralCard,
        layoutMode === 'tablet' ? styles.businessReferralCardTablet : null,
      ]}
    >
      <View style={styles.businessReferralCopy}>
        <View style={styles.businessReferralTitleRow}>
          <Ionicons name="gift-outline" size={20} color="#1D4ED8" />
          <Text style={styles.businessReferralTitle}>
            הזמינו עסק וקבלו חודשים מתנה
          </Text>
        </View>
        <Text style={styles.businessReferralBody}>
          שתפו את StampAix עם בעלי עסקים וקבלו חודשי שימוש חינם.
        </Text>
        {isLoading ? (
          <View style={styles.businessReferralLoading}>
            <ActivityIndicator
              size="small"
              color={DASHBOARD_TOKENS.colors.brandBlue}
              accessibilityLabel="טוען סיכום הזמנת עסקים"
            />
          </View>
        ) : hasCreditStatus ? (
          <View style={styles.businessReferralStatusRow}>
            {creditedMonths != null && creditedMonths > 0 ? (
              <Text style={styles.businessReferralStatus}>
                {creditedMonths} חודשים שהתקבלו
              </Text>
            ) : null}
            {pendingMonths != null && pendingMonths > 0 ? (
              <Text style={styles.businessReferralStatus}>
                {pendingMonths} בהמתנה
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onOpen}
        disabled={isSwitchingBusiness}
        accessibilityRole="button"
        accessibilityLabel="הזמנת עסק ל-StampAix"
        style={({ pressed }) => [
          styles.businessReferralButton,
          pressed ? styles.businessReferralButtonPressed : null,
          isSwitchingBusiness
            ? styles.businessReferralButtonDisabled
            : null,
        ]}
      >
        <Text style={styles.businessReferralButtonText}>הזמנת עסק</Text>
      </Pressable>
    </View>
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
  const [loadingRecommendationId, setLoadingRecommendationId] = useState<
    string | null
  >(null);
  const [interactionLoadingKey, setInteractionLoadingKey] = useState<
    string | null
  >(null);
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

  const handleOpen = async (recommendation: DashboardRecommendation) => {
    if (!activeBusinessId || isSwitchingBusiness || loadingRecommendationId) {
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
    setLoadingRecommendationId(recommendation.stableId);
    try {
      const session = await startRecommendationGuide({
        businessId: openedBusinessId as Id<'businesses'>,
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
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
        action: recommendation.action,
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
        throw new Error('INVALID_RECOMMENDATION_NAVIGATION');
      }
    } catch {
      Alert.alert('', 'ההמלצה כבר התעדכנה. נסו שוב.');
    } finally {
      setLoadingRecommendationId(null);
    }
  };

  const performInteraction = async (
    recommendation: DashboardRecommendation,
    action: 'dismiss' | 'snooze',
    openedBusinessId: string
  ) => {
    const key = `${recommendation.stableId}:${recommendation.evidenceFingerprint}`;
    setInteractionLoadingKey(key);
    await executeCurrentRecommendationInteraction({
      request: {
        businessId: openedBusinessId,
        stableId: recommendation.stableId,
        evidenceFingerprint: recommendation.evidenceFingerprint,
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
      onSettled: () => setInteractionLoadingKey(null),
    });
  };

  const handleShowOptions = (recommendation: DashboardRecommendation) => {
    if (!activeBusinessId || isSwitchingBusiness || interactionLoadingKey) {
      return;
    }
    Alert.alert('אפשרויות להמלצה', undefined, [
      {
        text: 'הזכירו לי אחר כך',
        onPress: () => {
          void performInteraction(
            recommendation,
            'snooze',
            String(activeBusinessId)
          );
        },
      },
      {
        text: 'הסתרת ההמלצה',
        style: 'destructive',
        onPress: () => {
          void performInteraction(
            recommendation,
            'dismiss',
            String(activeBusinessId)
          );
        },
      },
      { text: 'ביטול', style: 'cancel' },
    ]);
  };

  return (
    <SmartRecommendationsPanel
      layoutMode={layoutMode}
      status={recommendationStatus}
      primary={recommendationPrimary}
      secondary={recommendationSecondary}
      loadingRecommendationId={loadingRecommendationId}
      interactionLoadingKey={interactionLoadingKey}
      onOpen={handleOpen}
      onShowOptions={handleShowOptions}
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
  const canViewBusinessReferrals =
    activeBusinessCapabilities?.view_billing_state === true;
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
      label: 'ניקובים',
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
              הפעולה הבאה
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
            <View style={styles.activityHeadingRow}>
              <Text
                className={tw.textStart}
                style={[
                  styles.sectionTitle,
                  styles.activitySectionTitle,
                  {
                    fontSize: layout.sectionTitleSize,
                    lineHeight: layout.sectionTitleLineHeight,
                  },
                ]}
              >
                פעילות אחרונה
              </Text>
              <Pressable
                onPress={() =>
                  openRoute('/(authenticated)/(business)/analytics')
                }
                style={styles.activityActionButton}
              >
                <Text className={tw.textStart} style={styles.activityAction}>
                  {DASHBOARD_CUSTOMER_NAV_LABELS.insights}
                </Text>
              </Pressable>
            </View>
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
                label: 'קוד הצטרפות',
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

        {activeBusinessId && canViewBusinessReferrals ? (
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
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  recommendationsTitleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: justifyContent.start,
    gap: 6,
    ...rtlBaseView,
  },
  activityHeadingRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    ...rtlBaseView,
  },
  activitySectionTitle: {
    flex: 1,
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  activityAction: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.brandBlue,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  activityActionButton: {
    alignSelf: 'center',
  },
  businessReferralCard: {
    borderRadius: DASHBOARD_TOKENS.cardRadiusLarge,
    borderWidth: 1,
    borderColor: '#CFE0FF',
    backgroundColor: '#F8FAFF',
    padding: 14,
    gap: 12,
    ...DASHBOARD_TOKENS.cardShadowSoft,
    ...rtlBaseView,
  },
  businessReferralCardTablet: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  businessReferralCopy: {
    flex: 1,
    gap: 5,
    ...rtlBaseView,
  },
  businessReferralTitleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 7,
    ...rtlBaseView,
  },
  businessReferralTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  businessReferralBody: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  businessReferralLoading: {
    minHeight: 22,
    alignItems: alignItems.start,
    justifyContent: 'center',
  },
  businessReferralStatusRow: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
    ...rtlBaseView,
  },
  businessReferralStatus: {
    borderRadius: 999,
    backgroundColor: '#E8F0FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  businessReferralButton: {
    minHeight: 44,
    minWidth: 112,
    borderRadius: 12,
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
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
