import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BusinessReferralCard } from '@/components/business-dashboard/BusinessReferralCard';
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
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  isDashboardResponseForActiveBusiness,
  isRecommendationResponseForActiveBusiness,
} from '@/lib/dashboardBusinessIntegrity';
import { DASHBOARD_CUSTOMER_NAV_LABELS } from '@/lib/dashboard/navigationCopy';
import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
  getDashboardLayoutMode,
} from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  createRecommendationShownGuard,
  getRecommendationAnalyticsProps,
  safelyTrackRecommendationEvent,
} from '@/lib/recommendations/analytics';
import { openRecommendationAction } from '@/lib/recommendations/interaction';
import {
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
  | '/(authenticated)/(business)/settings-business-referrals'
  | '/(authenticated)/(business)/settings-business-subscription'
  | '/(authenticated)/(business)/team/index';

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
  const recommendationShownGuardRef = useRef(
    createRecommendationShownGuard()
  );
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

  const handleOpen = (recommendation: DashboardRecommendation) => {
    if (
      !activeBusinessId ||
      isSwitchingBusiness ||
      loadingRecommendationId
    ) {
      return;
    }
    let result: ReturnType<typeof openRecommendationAction> | undefined;
    try {
      result = openRecommendationAction({
        businessId: String(activeBusinessId),
        action: recommendation.action,
        analyticsProps: getRecommendationAnalyticsProps(recommendation),
        trackEvent: track,
        navigate: (target) => router.push(target as never),
        onStart: () =>
          setLoadingRecommendationId(recommendation.stableId),
        onSettled: () => setLoadingRecommendationId(null),
      });
    } catch {
      setLoadingRecommendationId(null);
      Alert.alert('שגיאה', 'לא הצלחנו לפתוח את הפעולה כרגע.');
      return;
    }
    if (!result || !result.ok) {
      setLoadingRecommendationId(null);
      Alert.alert(
        'לא ניתן לפתוח את הפעולה',
        'חסר מידע מדויק לניווט. הנתונים יתעדכנו אוטומטית.'
      );
    }
  };

  return (
    <SmartRecommendationsPanel
      layoutMode={layoutMode}
      status={recommendationStatus}
      primary={recommendationPrimary}
      secondary={recommendationSecondary}
      loadingRecommendationId={loadingRecommendationId}
      onOpen={handleOpen}
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
  const businessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canViewBillingState = businessCapabilities?.view_billing_state === true;
  const { entitlements, gate, limitStatus } = useEntitlements(activeBusinessId);
  const teamGate = gate('team');
  const [selectedDayStart, setSelectedDayStart] = useState(() => Date.now());
  const [selectedPreset, setSelectedPreset] = useState<DatePresetKey>('today');
  const [isReferralShareLoading, setIsReferralShareLoading] = useState(false);

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
  const referralCreditSummary = useQuery(
    api.referrals.getBusinessReferralCreditSummary,
    activeBusinessId && canViewBillingState
      ? { businessId: activeBusinessId }
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
  const createBusinessReferralLink = useMutation(
    api.referrals.getOrCreateBusinessReferralLink
  );

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
  const unifiedKpiItems = [
    {
      key: 'recovered_customers',
      label: 'לקוחות שחזרו',
      value: formatNumber(lifetimeMetrics?.totalCustomersJoinedAllTime ?? 0),
      icon: 'shield-checkmark-outline' as const,
      tone: 'amber' as const,
      helperValue: formatPeriodDelta(kpis?.activeCustomers ?? 0),
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
    {
      key: 'lifetime_returning_customers',
      label: 'לקוחות חוזרים',
      value: formatNumber(lifetimeMetrics?.returningCustomersAllTime ?? 0),
      icon: 'people-outline' as const,
      tone: 'teal' as const,
      helperValue: formatPeriodDelta(kpis?.activeCustomers ?? 0),
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
    openRoute('/(authenticated)/(business)/team/index');
  };

  const handleShareBusinessReferral = useCallback(async () => {
    if (!activeBusinessId || isReferralShareLoading) {
      return;
    }

    try {
      setIsReferralShareLoading(true);
      const link = await createBusinessReferralLink({
        businessId: activeBusinessId,
      });
      const joinUrl = `https://stampix.app/join?bref=${link.code}`;
      const message = `אני משתמש ב-StampAix לניהול כרטיסי ניקוב ללקוחות.

אם אתה בעל עסק זה יכול להתאים גם לך.

הצטרף דרך הקישור שלי:
${joinUrl}`;
      await Share.share({ message });
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'PAID_PLAN_REQUIRED'
          ? 'השיתוף זמין אחרי הצטרפות למסלול בתשלום.'
          : 'לא הצלחנו לפתוח את חלון השיתוף כרגע.';
      Alert.alert('שגיאה', message);
    } finally {
      setIsReferralShareLoading(false);
    }
  }, [activeBusinessId, createBusinessReferralLink, isReferralShareLoading]);

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
          notificationCount={0}
          onPressNotifications={() =>
            Alert.alert('התראות', 'אין התראות זמינות כרגע.')
          }
          onPressMenu={() => openRoute('/(authenticated)/(business)/settings')}
        />

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#64748B"
            />
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
              מצב העסק
            </Text>
          </View>
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

        <View style={styles.section}>
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
            פעולות מהירות
          </Text>
          <QuickShortcutsGrid
            layoutMode={layoutMode}
            items={[
              {
                key: 'scanner',
                label: 'סריקה',
                icon: 'scan-outline',
                onPress: () => openRoute('/(authenticated)/(business)/scanner'),
              },
              {
                key: 'customers',
                label: DASHBOARD_CUSTOMER_NAV_LABELS.customers,
                icon: 'people-outline',
                onPress: () =>
                  openRoute('/(authenticated)/(business)/customers'),
              },
              {
                key: 'programs',
                label: 'כרטיסיות',
                icon: 'albums-outline',
                onPress: () =>
                  openRoute('/(authenticated)/(business)/programs'),
              },
              {
                key: 'campaigns',
                label: 'מבצעים',
                icon: 'megaphone-outline',
                onPress: () =>
                  openRoute('/(authenticated)/(business)/campaigns'),
              },
              {
                key: 'referrals',
                label: 'שיתוף',
                icon: 'share-social-outline',
                onPress: () =>
                  openRoute(
                    '/(authenticated)/(business)/settings-business-referrals'
                  ),
              },
              {
                key: 'team',
                label: 'עובדים',
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
              {
                key: 'subscription',
                label: 'מנוי',
                icon: 'card-outline',
                onPress: () =>
                  openRoute(
                    '/(authenticated)/(business)/settings-business-subscription'
                  ),
              },
            ]}
          />
        </View>

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
              הפעולות הבאות
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
          <BusinessReferralCard
            layoutMode={layoutMode}
            totalFreeMonthsEarned={referralCreditSummary?.creditedMonths ?? 0}
            pendingInvitesCount={
              referralCreditSummary?.pendingInvitesCount ?? 0
            }
            activeReferralsCount={
              referralCreditSummary?.activeReferralsCount ?? 0
            }
            isShareLoading={isReferralShareLoading}
            shareDisabled={!activeBusinessId}
            onPressShare={() => void handleShareBusinessReferral()}
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
  sectionTitleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
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
});
