import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { B2BReferralSummary } from '@/components/business-dashboard/B2BReferralSummary';
import { BusinessStatusCard } from '@/components/business-dashboard/BusinessStatusCard';
import { CompactActivitySummaryRow } from '@/components/business-dashboard/CompactActivitySummaryRow';
import { DailyKpiGrid } from '@/components/business-dashboard/DailyKpiGrid';
import { DashboardHeader } from '@/components/business-dashboard/DashboardHeader';
import {
  type DatePresetKey,
  DateSelectorBar,
} from '@/components/business-dashboard/DateSelectorBar';
import { LifetimeMetricsRow } from '@/components/business-dashboard/LifetimeMetricsRow';
import { QuickShortcutsGrid } from '@/components/business-dashboard/QuickShortcutsGrid';
import { SmartRecommendationsPanel } from '@/components/business-dashboard/SmartRecommendationsPanel';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  DASHBOARD_TOKENS,
  getDashboardLayout,
  getDashboardLayoutMode,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISRAEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const NUMBER_FORMATTER = new Intl.NumberFormat('he-IL', {
  maximumFractionDigits: 0,
});

type BusinessRoute =
  | '/(authenticated)/(business)/scanner'
  | '/(authenticated)/(business)/campaigns'
  | '/(authenticated)/(business)/customers'
  | '/(authenticated)/(business)/programs'
  | '/(authenticated)/(business)/settings'
  | '/(authenticated)/(business)/analytics'
  | '/(authenticated)/(business)/settings-business-profile'
  | '/(authenticated)/(business)/settings-business-referrals'
  | '/(authenticated)/(business)/settings-business-subscription'
  | '/(authenticated)/(business)/team/index';

type CustomerRouteFilter = 'near_reward' | 'at_risk' | 'new_customers';
type RecommendationActionKind =
  | 'open_campaign_draft'
  | 'open_cards'
  | 'open_campaigns'
  | 'open_profile'
  | 'view_analytics'
  | 'view_customers'
  | 'view_subscription'
  | 'none';

type DashboardRecommendationCard = {
  key: string;
  title: string;
  body: string;
  supportingText?: string;
  evidenceTags: string[];
  tone: 'critical' | 'warning' | 'neutral' | 'success';
  recommendationId?: string | null;
  primaryCta?: {
    kind: RecommendationActionKind;
    label: string;
    draftType?: 'welcome' | 'winback' | 'promo' | null;
    customerFilter?: CustomerRouteFilter | null;
  } | null;
};

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatSignedNumber(value: number) {
  if (value === 0) {
    return '0';
  }
  return `${value > 0 ? '+' : '-'}${formatNumber(Math.abs(value))}`;
}

function getIsraelDayKey(timestamp: number) {
  return DAY_KEY_FORMATTER.format(new Date(timestamp));
}

function buildKpiTrend(value: number, previousValue: number) {
  if (value === previousValue) {
    return { direction: 'flat' as const, label: 'ללא שינוי' };
  }
  const delta = value - previousValue;
  if (previousValue <= 0) {
    return delta > 0
      ? { direction: 'up' as const, label: `+${formatNumber(Math.abs(delta))}` }
      : { direction: 'flat' as const, label: 'ללא שינוי' };
  }
  const percent = Math.round(Math.abs((delta / previousValue) * 100));
  return {
    direction: delta > 0 ? ('up' as const) : ('down' as const),
    label: `${delta > 0 ? '+' : '-'}${percent}%`,
  };
}

function localizeCtaLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'view subscription') {
    return 'צפו במנוי';
  }
  if (normalized === 'open campaigns') {
    return 'פתחו קמפיינים';
  }
  if (normalized === 'open cards') {
    return 'פתחו כרטיסיות נאמנות';
  }
  if (normalized === 'view customers') {
    return 'צפו בלקוחות';
  }
  if (normalized === 'finish setup') {
    return 'השלימו את ההגדרה';
  }
  return label;
}

function buildEmptyRecommendationCards(): DashboardRecommendationCard[] {
  return [
    {
      key: 'at_risk_customers',
      title: 'לקוחות בסיכון',
      body: '2 לקוחות בדרך לאיבוד. כדאי לפעול עכשיו.',
      evidenceTags: [],
      tone: 'critical',
      primaryCta: {
        kind: 'view_customers',
        label: 'פתח לקוחות',
        customerFilter: 'at_risk',
      },
    },
    {
      key: 'return_campaign',
      title: 'הפעל קמפיין החזרה',
      body: 'יש לקוחות שלא ביקרו ב-30 הימים האחרונים.',
      evidenceTags: [],
      tone: 'warning',
      primaryCta: {
        kind: 'open_campaign_draft',
        label: 'צור קמפיין',
        draftType: 'winback',
      },
    },
  ];
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

export default function BusinessDashboardScreen() {
  const { width } = useWindowDimensions();
  const layoutMode = getDashboardLayoutMode(width);
  const layout = getDashboardLayout(layoutMode);
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const sessionContext = useSessionContext();
  const {
    activeBusinessId,
    activeBusiness,
    isLoading: isBusinessLoading,
  } = useActiveBusiness();
  const [selectedDayStart, setSelectedDayStart] = useState(() => Date.now());
  const [selectedPreset, setSelectedPreset] = useState<DatePresetKey>('today');
  const [applyingRecommendationKey, setApplyingRecommendationKey] = useState<
    string | null
  >(null);

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
  const referralDashboard = useQuery(
    api.referrals.getBusinessReferralDashboard,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const recentActivity = useQuery(
    api.events.getRecentActivity,
    activeBusinessId ? { businessId: activeBusinessId, limit: 5 } : 'skip'
  );
  const executeRecommendationCta = useMutation(
    api.aiRecommendations.executeRecommendationPrimaryCta
  );
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const anchorNow = dashboardSummary?.freshness?.generatedAt ?? Date.now();
  const businessName =
    dashboardSummary?.business?.businessName?.trim() ||
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

  const lifetimeMetrics = dashboardSummary?.lifetimeMetrics;
  const lifetimeMetricChanges = dashboardSummary?.lifetimeMetricChanges;
  const lifetimeItems = [
    {
      key: 'lifetime_stamps',
      label: 'לקוחות שניצלו מנטישה',
      value: formatNumber(lifetimeMetrics?.totalStampsAllTime ?? 0),
      icon: 'shield-checkmark-outline' as const,
      tone: 'amber' as const,
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.stampsLast7Days ?? 0
      ),
    },
    {
      key: 'lifetime_redemptions',
      label: 'הטבות שנוצלו',
      value: formatNumber(lifetimeMetrics?.totalRedemptionsAllTime ?? 0),
      icon: 'gift-outline-custom' as const,
      tone: 'violet' as const,
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.redemptionsLast7Days ?? 0
      ),
    },
    {
      key: 'lifetime_joined_customers',
      label: 'ניקובים',
      value: formatNumber(lifetimeMetrics?.totalCustomersJoinedAllTime ?? 0),
      icon: 'stamp-outline-custom' as const,
      tone: 'blue' as const,
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.joinedCustomersLast7Days ?? 0
      ),
    },
    {
      key: 'lifetime_returning_customers',
      label: 'לקוחות חוזרים',
      value: formatNumber(lifetimeMetrics?.returningCustomersAllTime ?? 0),
      icon: 'people-outline' as const,
      tone: 'teal' as const,
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.returningCustomersLast7Days ?? 0
      ),
    },
  ];

  const kpis = dashboardDay?.kpis;
  const selectedDayContextLabel =
    dashboardDay?.dateContext?.dayKey === getIsraelDayKey(anchorNow)
      ? 'היום'
      : `${dashboardDay?.dateContext?.rangeDays ?? 1} ימים`;
  const rangeComparisonText =
    (dashboardDay?.dateContext?.rangeDays ?? 1) > 1
      ? `מול ${dashboardDay?.dateContext?.rangeDays ?? 1} קודמים`
      : 'מאתמול';
  const dailyKpiItems = [
    {
      key: 'stamps',
      label: 'ניקובים',
      metaLabel: selectedDayContextLabel,
      value: formatNumber(kpis?.stamps?.value ?? 0),
      icon: 'scan-outline' as const,
      tone: 'blue' as const,
      trend: buildKpiTrend(
        kpis?.stamps?.value ?? 0,
        kpis?.stamps?.previousValue ?? 0
      ),
      comparisonText: rangeComparisonText,
    },
    {
      key: 'redemptions',
      label: 'הטבות שנוצלו',
      metaLabel: selectedDayContextLabel,
      value: formatNumber(kpis?.redemptions?.value ?? 0),
      icon: 'gift-outline' as const,
      tone: 'violet' as const,
      trend: buildKpiTrend(
        kpis?.redemptions?.value ?? 0,
        kpis?.redemptions?.previousValue ?? 0
      ),
      comparisonText: rangeComparisonText,
    },
    {
      key: 'activeCustomers',
      label: 'לקוחות פעילים',
      metaLabel: selectedDayContextLabel,
      value: formatNumber(kpis?.activeCustomers ?? 0),
      icon: 'people-outline' as const,
      tone: 'blue' as const,
      trend: buildKpiTrend(
        kpis?.activeCustomers ?? 0,
        kpis?.activeCustomersPreviousDay ?? 0
      ),
      comparisonText: rangeComparisonText,
    },
    {
      key: 'atRiskCustomers',
      label: 'לקוחות בסיכון',
      metaLabel: selectedDayContextLabel,
      value: formatNumber(kpis?.atRiskCustomers ?? 0),
      icon: 'warning-outline' as const,
      tone: 'amber' as const,
      trend: buildKpiTrend(
        kpis?.atRiskCustomers ?? 0,
        kpis?.atRiskCustomersPreviousDay ?? 0
      ),
      comparisonText: rangeComparisonText,
    },
  ];

  const recommendationCards = useMemo(() => {
    const cards = (dashboardSummary?.recommendations?.cards ??
      []) as DashboardRecommendationCard[];
    const source = cards.length > 0 ? cards : buildEmptyRecommendationCards();
    return source.map((card) => ({
      ...card,
      primaryCtaLabel: card.primaryCta?.label
        ? localizeCtaLabel(card.primaryCta.label)
        : null,
    }));
  }, [dashboardSummary]);

  const openRoute = (route: BusinessRoute) => router.push(route as never);
  const openCustomersWithFilter = (filter?: CustomerRouteFilter | null) => {
    if (!filter) {
      return openRoute('/(authenticated)/(business)/customers');
    }
    router.push({
      pathname: '/(authenticated)/(business)/customers',
      params: { filter },
    });
  };

  const openRecommendationTarget = async (
    primaryCta: DashboardRecommendationCard['primaryCta']
  ) => {
    if (!primaryCta) {
      return;
    }
    if (primaryCta.kind === 'open_campaign_draft' && activeBusinessId) {
      const draftType =
        primaryCta.draftType === 'welcome' ||
        primaryCta.draftType === 'winback' ||
        primaryCta.draftType === 'promo'
          ? primaryCta.draftType
          : 'promo';
      const draft = await createCampaignDraft({
        businessId: activeBusinessId,
        type: draftType,
        rules:
          draftType === 'welcome'
            ? { audience: 'new_customers', joinedWithinDays: 14 }
            : draftType === 'winback'
              ? { audience: 'inactive_days', daysInactive: 30 }
              : { audience: 'all_active_members' },
      });
      router.push({
        pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
        params: {
          campaignId: String(draft.campaignId),
          businessId: String(activeBusinessId),
        },
      });
      return;
    }
    if (primaryCta.kind === 'view_customers') {
      return openCustomersWithFilter(primaryCta.customerFilter ?? null);
    }
    if (primaryCta.kind === 'open_cards') {
      return openRoute('/(authenticated)/(business)/programs');
    }
    if (primaryCta.kind === 'open_campaigns') {
      return openRoute('/(authenticated)/(business)/campaigns');
    }
    if (primaryCta.kind === 'open_profile') {
      return openRoute('/(authenticated)/(business)/settings-business-profile');
    }
    if (primaryCta.kind === 'view_subscription') {
      return openRoute(
        '/(authenticated)/(business)/settings-business-subscription'
      );
    }
  };

  const handleRecommendationCta = async (cardKey: string) => {
    if (!activeBusinessId || applyingRecommendationKey) {
      return;
    }
    const card = recommendationCards.find((entry) => entry.key === cardKey);
    if (!card?.primaryCta || card.primaryCta.kind === 'none') {
      return;
    }
    setApplyingRecommendationKey(cardKey);
    try {
      if (!card.recommendationId) {
        return await openRecommendationTarget(card.primaryCta);
      }
      const result = await executeRecommendationCta({
        businessId: activeBusinessId,
        recommendationId: card.recommendationId as never,
      });
      if (result.kind === 'open_draft') {
        router.push({
          pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
          params: {
            campaignId: String(result.campaignId),
            businessId: String(activeBusinessId),
          },
        });
        return;
      }
      if (result.kind === 'view_customers') {
        return openCustomersWithFilter(result.customerFilter ?? null);
      }
      if (result.kind === 'open_cards') {
        return openRoute('/(authenticated)/(business)/programs');
      }
      if (result.kind === 'open_profile') {
        return openRoute(
          '/(authenticated)/(business)/settings-business-profile'
        );
      }
      if (result.kind === 'view_subscription') {
        return openRoute(
          '/(authenticated)/(business)/settings-business-subscription'
        );
      }
      if (result.kind === 'view_analytics') {
        return openRoute('/(authenticated)/(business)/customers');
      }
      return await openRecommendationTarget(card.primaryCta);
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא הצלחנו לפתוח את ההמלצה.'
      );
    } finally {
      setApplyingRecommendationKey(null);
    }
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
          notificationCount={0}
          onPressNotifications={() =>
            Alert.alert('התראות', 'אין התראות זמינות כרגע.')
          }
          onPressMenu={() => openRoute('/(authenticated)/(business)/settings')}
        />

        <BusinessStatusCard
          layoutMode={layoutMode}
          plan={dashboardSummary?.business?.plan ?? ''}
          profileIncomplete={
            dashboardSummary?.business?.profileIncomplete ?? false
          }
          usageWarnings={
            Array.isArray(
              (dashboardSummary as { usageWarnings?: unknown })?.usageWarnings
            )
              ? (((dashboardSummary as { usageWarnings?: unknown })
                  .usageWarnings ?? []) as string[])
              : []
          }
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
              מצטברים של העסק
            </Text>
          </View>
          <LifetimeMetricsRow layoutMode={layoutMode} metrics={lifetimeItems} />
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
                label: 'לקוחות',
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
                label: 'קמפיינים',
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
                icon: 'person-add-outline',
                onPress: () =>
                  openRoute('/(authenticated)/(business)/team/index'),
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
            ביצועים לתקופה
          </Text>
          <DateSelectorBar
            layoutMode={layoutMode}
            value={selectedPreset}
            onChange={handleSelectPreset}
          />
          <DailyKpiGrid layoutMode={layoutMode} items={dailyKpiItems} />
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
            המלצות עבור
          </Text>
          <SmartRecommendationsPanel
            layoutMode={layoutMode}
            cards={recommendationCards}
            onPressCta={(cardKey) => void handleRecommendationCta(cardKey)}
            onPressDetails={(cardKey) => {
              const card = recommendationCards.find(
                (entry) => entry.key === cardKey
              );
              if (card?.primaryCta) {
                void openRecommendationTarget(card.primaryCta);
              }
            }}
            loadingCardKey={applyingRecommendationKey}
          />
        </View>

        {Array.isArray(recentActivity) && recentActivity.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.activityHeadingRow}>
              <Pressable
                onPress={() =>
                  openRoute('/(authenticated)/(business)/analytics')
                }
              >
                <Text style={styles.activityAction}>הצג הכל</Text>
              </Pressable>
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
            שיתוף עסק מביא עסק
          </Text>
          <B2BReferralSummary
            layoutMode={layoutMode}
            items={[
              {
                key: 'generated',
                label: 'נוצרו',
                value: formatNumber(referralDashboard?.referralsGenerated ?? 0),
              },
              {
                key: 'completed',
                label: 'הושלמו',
                value: formatNumber(referralDashboard?.referralsCompleted ?? 0),
              },
              {
                key: 'granted',
                label: 'הוענקו',
                value: formatNumber(referralDashboard?.rewardsGranted ?? 0),
              },
              {
                key: 'redeemed',
                label: 'מומשו',
                value: formatNumber(referralDashboard?.rewardsRedeemed ?? 0),
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
  },
  scroll: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
  },
  content: {
    paddingHorizontal: DASHBOARD_TOKENS.spacingPageHorizontal,
    paddingTop: 16,
    paddingBottom: 124,
    gap: 22,
  },
  section: {
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: DASHBOARD_TOKENS.typography.sectionTitle.fontSize,
    lineHeight: DASHBOARD_TOKENS.typography.sectionTitle.lineHeight,
    fontWeight: DASHBOARD_TOKENS.typography.sectionTitle.fontWeight,
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  activityHeadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activityAction: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.brandBlue,
  },
});
