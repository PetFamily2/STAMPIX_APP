import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DailyKpiGrid } from '@/components/business-dashboard/DailyKpiGrid';
import { DashboardHeader } from '@/components/business-dashboard/DashboardHeader';
import {
  type DatePresetKey,
  DateSelectorBar,
} from '@/components/business-dashboard/DateSelectorBar';
import { LifetimeMetricsRow } from '@/components/business-dashboard/LifetimeMetricsRow';
import { SmartRecommendationsPanel } from '@/components/business-dashboard/SmartRecommendationsPanel';
import { BusinessPageShell, SurfaceCard } from '@/components/business-ui';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
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
  | '/(authenticated)/(business)/campaigns'
  | '/(authenticated)/(business)/customers'
  | '/(authenticated)/(business)/programs'
  | '/(authenticated)/(business)/scanner'
  | '/(authenticated)/(business)/settings'
  | '/(authenticated)/(business)/settings-business-profile'
  | '/(authenticated)/(business)/settings-business-subscription';

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

type DatePresetSelection = DatePresetKey;

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
      ? {
          direction: 'up' as const,
          label: `+${formatNumber(Math.abs(delta))}`,
        }
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

  if (normalized === 'create first campaign') {
    return 'צרו קמפיין ראשון';
  }
  if (normalized === 'create welcome campaign') {
    return 'צרו קמפיין ברוכים הבאים';
  }
  if (normalized === 'create winback campaign') {
    return 'צרו קמפיין החזרה';
  }
  if (normalized === 'view eligible customers') {
    return 'צפו בלקוחות מתאימים';
  }
  if (normalized === 'create first card') {
    return 'פתחו תוכנית ראשונה';
  }
  if (normalized === 'finish setup') {
    return 'השלימו את ההגדרה';
  }
  if (normalized === 'view subscription') {
    return 'צפו במנוי';
  }
  if (normalized === 'open campaigns') {
    return 'פתחו קמפיינים';
  }
  if (normalized === 'open cards') {
    return 'פתחו תוכניות';
  }
  if (normalized === 'view customers') {
    return 'צפו בלקוחות';
  }

  return label;
}

function buildLoadingRecommendationCard(): DashboardRecommendationCard {
  return {
    key: 'loading_recommendations',
    title: 'טוען המלצות',
    body: 'אוספים את האותות התפעוליים כדי להציג את הפעולה הבאה.',
    evidenceTags: [],
    tone: 'neutral',
    primaryCta: null,
  };
}

function buildEmptyRecommendationCard(): DashboardRecommendationCard {
  return {
    key: 'no_urgent_actions',
    title: 'אין פעולה דחופה כרגע',
    body: 'העסק יציב כרגע ואין צורך בפעולה מיידית. נמשיך לעקוב ולהבליט הזדמנויות חדשות כשהן יופיעו.',
    supportingText: 'המערכת תציג כאן המלצות חדשות כשיזוהו הזדמנויות פעולה.',
    evidenceTags: [],
    tone: 'success',
    primaryCta: null,
  };
}

function getRangeDaysForPreset(preset: DatePresetSelection) {
  if (preset === 'last_7_days') {
    return 7;
  }
  if (preset === 'last_30_days') {
    return 30;
  }
  return 1;
}

export default function BusinessDashboardScreen() {
  const insets = useSafeAreaInsets();
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
  const [selectedPreset, setSelectedPreset] =
    useState<DatePresetSelection>('today');
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
  const todayKey = getIsraelDayKey(anchorNow);
  const selectedDayKey =
    dashboardDay?.dateContext?.dayKey ?? getIsraelDayKey(selectedDayStart);
  const activeRangeDays = dashboardDay?.dateContext?.rangeDays ?? 1;
  const isRangeAggregation = activeRangeDays > 1;
  const selectedDayContextLabel = isRangeAggregation
    ? `${activeRangeDays} ימים`
    : selectedDayKey === todayKey
      ? 'היום'
      : 'אתמול';

  const businessName =
    dashboardSummary?.business?.businessName?.trim() ||
    activeBusiness?.name?.trim() ||
    'העסק שלך';
  const currentUser = sessionContext?.user;
  const dashboardDisplayName =
    currentUser?.firstName?.trim() ||
    currentUser?.fullName?.trim()?.split(/\s+/)[0] ||
    [currentUser?.firstName?.trim(), currentUser?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    businessName;
  const avatarUrl = currentUser?.avatarUrl ?? null;

  const lifetimeMetrics = dashboardSummary?.lifetimeMetrics;
  const lifetimeMetricChanges = dashboardSummary?.lifetimeMetricChanges;
  const lifetimeItems = [
    {
      key: 'lifetime_stamps',
      label: 'סה"כ ניקובים',
      value: formatNumber(lifetimeMetrics?.totalStampsAllTime ?? 0),
      icon: 'ticket-outline' as const,
      tone: 'teal' as const,
      helperLabel: 'שבוע',
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.stampsLast7Days ?? 0
      ),
    },
    {
      key: 'lifetime_redemptions',
      label: 'הטבות שמומשו',
      value: formatNumber(lifetimeMetrics?.totalRedemptionsAllTime ?? 0),
      icon: 'gift-outline' as const,
      tone: 'violet' as const,
      helperLabel: 'שבוע',
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.redemptionsLast7Days ?? 0
      ),
    },
    {
      key: 'lifetime_joined_customers',
      label: 'לקוחות שהצטרפו',
      value: formatNumber(lifetimeMetrics?.totalCustomersJoinedAllTime ?? 0),
      icon: 'person-add-outline' as const,
      tone: 'blue' as const,
      helperLabel: 'שבוע',
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.joinedCustomersLast7Days ?? 0
      ),
    },
    {
      key: 'lifetime_returning_customers',
      label: 'לקוחות חוזרים',
      value: formatNumber(lifetimeMetrics?.returningCustomersAllTime ?? 0),
      icon: 'people-outline' as const,
      tone: 'amber' as const,
      helperLabel: 'שבוע',
      helperValue: formatSignedNumber(
        lifetimeMetricChanges?.returningCustomersLast7Days ?? 0
      ),
    },
  ];

  const kpis = dashboardDay?.kpis;
  const rangeComparisonText =
    activeRangeDays > 1 ? `מול ${activeRangeDays} קודמים` : 'מאתמול';
  const dailyKpiItems = [
    {
      key: 'stamps',
      label: 'ניקובים',
      metaLabel: selectedDayContextLabel,
      value: formatNumber(kpis?.stamps?.value ?? 0),
      icon: 'ticket-outline' as const,
      tone: 'teal' as const,
      trend: buildKpiTrend(
        kpis?.stamps?.value ?? 0,
        kpis?.stamps?.previousValue ?? 0
      ),
      comparisonText: rangeComparisonText,
    },
    {
      key: 'redemptions',
      label: 'הטבות',
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
      metaLabel: '30 יום',
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
      metaLabel: 'מחזור צפוי',
      value: formatNumber(kpis?.atRiskCustomers ?? 0),
      icon: 'alert-circle-outline' as const,
      tone: 'amber' as const,
      trend: buildKpiTrend(
        kpis?.atRiskCustomers ?? 0,
        kpis?.atRiskCustomersPreviousDay ?? 0
      ),
      comparisonText: rangeComparisonText,
    },
  ];
  const recommendationCards = useMemo(() => {
    if (dashboardSummary === undefined) {
      return [buildLoadingRecommendationCard()];
    }

    const cards = (dashboardSummary?.recommendations?.cards ??
      []) as DashboardRecommendationCard[];

    return (cards.length > 0 ? cards : [buildEmptyRecommendationCard()]).map(
      (card) => ({
        key: card.key,
        title: card.title,
        body: card.body,
        supportingText: card.supportingText ?? '',
        evidenceTags: Array.isArray(card.evidenceTags) ? card.evidenceTags : [],
        tone: card.tone,
        recommendationId: card.recommendationId ?? null,
        primaryCta: card.primaryCta ?? null,
        primaryCtaLabel: card.primaryCta?.label
          ? localizeCtaLabel(card.primaryCta.label)
          : null,
      })
    );
  }, [dashboardSummary]);

  const recommendationCardsByKey = useMemo(
    () =>
      new Map(
        recommendationCards.map((card) => [
          card.key,
          {
            recommendationId: card.recommendationId,
            primaryCta: card.primaryCta,
          },
        ])
      ),
    [recommendationCards]
  );

  const openRoute = (route: BusinessRoute) => {
    router.push(route);
  };

  const openCustomersWithFilter = (filter?: CustomerRouteFilter | null) => {
    if (filter) {
      router.push({
        pathname: '/(authenticated)/(business)/customers',
        params: { filter },
      });
      return;
    }

    openRoute('/(authenticated)/(business)/customers');
  };

  const openCampaignDraft = async (
    draftType: 'promo' | 'welcome' | 'winback'
  ) => {
    if (!activeBusinessId) {
      return;
    }

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
  };

  const openRecommendationTarget = async (primaryCta: {
    kind: RecommendationActionKind;
    draftType?: 'welcome' | 'winback' | 'promo' | null;
    customerFilter?: CustomerRouteFilter | null;
  }) => {
    switch (primaryCta.kind) {
      case 'open_campaign_draft': {
        const draftType =
          primaryCta.draftType === 'welcome' ||
          primaryCta.draftType === 'winback' ||
          primaryCta.draftType === 'promo'
            ? primaryCta.draftType
            : 'promo';
        await openCampaignDraft(draftType);
        return;
      }
      case 'view_customers':
        openCustomersWithFilter(primaryCta.customerFilter ?? null);
        return;
      case 'view_analytics':
        openRoute('/(authenticated)/(business)/customers');
        return;
      case 'open_cards':
        openRoute('/(authenticated)/(business)/programs');
        return;
      case 'open_campaigns':
        openRoute('/(authenticated)/(business)/campaigns');
        return;
      case 'open_profile':
        openRoute('/(authenticated)/(business)/settings-business-profile');
        return;
      case 'view_subscription':
        openRoute('/(authenticated)/(business)/settings-business-subscription');
        return;
      default:
        return;
    }
  };

  const openRecommendationDetails = (cardKey: string) => {
    const card = recommendationCardsByKey.get(cardKey);
    if (!card?.primaryCta) {
      return;
    }

    switch (card.primaryCta.kind) {
      case 'open_campaign_draft':
      case 'open_campaigns':
        openRoute('/(authenticated)/(business)/campaigns');
        return;
      case 'view_customers':
        openCustomersWithFilter(card.primaryCta.customerFilter ?? null);
        return;
      case 'view_analytics':
        openRoute('/(authenticated)/(business)/customers');
        return;
      case 'open_cards':
        openRoute('/(authenticated)/(business)/programs');
        return;
      case 'open_profile':
        openRoute('/(authenticated)/(business)/settings-business-profile');
        return;
      case 'view_subscription':
        openRoute('/(authenticated)/(business)/settings-business-subscription');
        return;
      default:
        return;
    }
  };

  const handleRecommendationCta = async (cardKey: string) => {
    if (!activeBusinessId || applyingRecommendationKey) {
      return;
    }

    const card = recommendationCardsByKey.get(cardKey);
    if (!card?.primaryCta || card.primaryCta.kind === 'none') {
      return;
    }

    setApplyingRecommendationKey(cardKey);
    try {
      if (!card.recommendationId) {
        await openRecommendationTarget(card.primaryCta);
        return;
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
        openCustomersWithFilter(result.customerFilter ?? null);
        return;
      }
      if (result.kind === 'view_analytics') {
        openRoute('/(authenticated)/(business)/customers');
        return;
      }
      if (result.kind === 'open_cards') {
        openRoute('/(authenticated)/(business)/programs');
        return;
      }
      if (result.kind === 'open_profile') {
        openRoute('/(authenticated)/(business)/settings-business-profile');
        return;
      }
      if (result.kind === 'view_subscription') {
        openRoute('/(authenticated)/(business)/settings-business-subscription');
        return;
      }

      await openRecommendationTarget(card.primaryCta);
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
    if (preset === 'today') {
      setSelectedPreset('today');
      setSelectedDayStart(anchorNow);
      return;
    }
    if (preset === 'yesterday') {
      setSelectedPreset('yesterday');
      setSelectedDayStart(anchorNow - DAY_MS);
      return;
    }
    if (preset === 'last_7_days') {
      setSelectedPreset('last_7_days');
      setSelectedDayStart(anchorNow);
      return;
    }

    setSelectedPreset('last_30_days');
    setSelectedDayStart(anchorNow);
  };

  if (isAppModeLoading || isBusinessLoading) {
    return <FullScreenLoading />;
  }

  if (!activeBusinessId && !isPreviewMode) {
    return <FullScreenLoading />;
  }

  return (
    <BusinessPageShell
      backgroundColor="#F4F5FB"
      contentPaddingHorizontal={10}
      stickyHeader={
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 6}
          backgroundColor="#F4F5FB"
        >
          <DashboardHeader
            displayName={dashboardDisplayName}
            avatarUrl={avatarUrl}
            onPressMenu={() =>
              openRoute('/(authenticated)/(business)/settings')
            }
          />
        </StickyScrollHeader>
      }
    >
      <View style={styles.content}>
        <LifetimeMetricsRow metrics={lifetimeItems} />

        <DateSelectorBar value={selectedPreset} onChange={handleSelectPreset} />

        <View style={styles.summaryCluster}>
          <DailyKpiGrid items={dailyKpiItems} />
        </View>

        <SmartRecommendationsPanel
          cards={recommendationCards}
          onPressCta={(cardKey) => {
            void handleRecommendationCta(cardKey);
          }}
          onPressDetails={openRecommendationDetails}
          loadingCardKey={applyingRecommendationKey}
        />

        {dashboardDay === undefined ? (
          <SurfaceCard elevated={false} padding="sm" radius="lg">
            <Text className={tw.textStart} style={styles.loadingText}>
              מעדכן את מדדי היום הנבחר...
            </Text>
          </SurfaceCard>
        ) : null}
      </View>
    </BusinessPageShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 2,
    gap: 10,
  },
  summaryCluster: {
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
