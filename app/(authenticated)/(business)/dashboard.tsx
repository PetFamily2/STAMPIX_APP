import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompactActivitySummaryRow } from '@/components/business-dashboard/CompactActivitySummaryRow';
import { DailyKpiGrid } from '@/components/business-dashboard/DailyKpiGrid';
import { DashboardHeader } from '@/components/business-dashboard/DashboardHeader';
import {
  type DatePresetKey,
  DateSelectorBar,
  type DateSelectorItem,
} from '@/components/business-dashboard/DateSelectorBar';
import { LifetimeMetricsRow } from '@/components/business-dashboard/LifetimeMetricsRow';
import { SmartRecommendationsPanel } from '@/components/business-dashboard/SmartRecommendationsPanel';
import { BusinessPageShell, SurfaceCard } from '@/components/business-ui';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
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
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: ISRAEL_TIME_ZONE,
  weekday: 'short',
});
const DAY_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: ISRAEL_TIME_ZONE,
  day: 'numeric',
});
const MONTH_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: ISRAEL_TIME_ZONE,
  month: 'short',
});
const SELECTED_DAY_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: ISRAEL_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const DATE_SELECTOR_LABEL_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: ISRAEL_TIME_ZONE,
  day: 'numeric',
  month: 'short',
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

type DatePresetSelection = DatePresetKey | 'custom';

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

function getIsraelDayKey(timestamp: number) {
  return DAY_KEY_FORMATTER.format(new Date(timestamp));
}

function buildDateSelectorItems(now: number, count: number) {
  return Array.from({ length: count }, (_unused, index) => {
    const anchor = now - index * DAY_MS;
    return {
      key: getIsraelDayKey(anchor),
      anchor,
      weekdayLabel: WEEKDAY_FORMATTER.format(new Date(anchor)),
      dayNumber: DAY_FORMATTER.format(new Date(anchor)),
      shortMonth: MONTH_FORMATTER.format(new Date(anchor)),
      isToday: index === 0,
    } satisfies DateSelectorItem;
  });
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

function getPresetLabel(preset: DatePresetSelection) {
  if (preset === 'today') {
    return 'היום';
  }
  if (preset === 'yesterday') {
    return 'אתמול';
  }
  if (preset === 'last_7_days') {
    return '7 ימים';
  }
  if (preset === 'last_30_days') {
    return '30 ימים';
  }
  return 'יום נבחר';
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
  const {
    activeBusinessId,
    activeBusiness,
    isLoading: isBusinessLoading,
  } = useActiveBusiness();

  const [selectedDayStart, setSelectedDayStart] = useState(() => Date.now());
  const [selectedPreset, setSelectedPreset] =
    useState<DatePresetSelection>('today');
  const [visibleDayCount, setVisibleDayCount] = useState(30);
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
  const yesterdayKey = getIsraelDayKey(anchorNow - DAY_MS);
  const dateItems = useMemo(
    () => buildDateSelectorItems(anchorNow, visibleDayCount),
    [anchorNow, visibleDayCount]
  );

  const selectedDayKey =
    dashboardDay?.dateContext?.dayKey ?? getIsraelDayKey(selectedDayStart);
  const selectedDayLabel = SELECTED_DAY_FORMATTER.format(
    new Date(dashboardDay?.dateContext?.dayStart ?? selectedDayStart)
  );
  const selectedDayContextLabel =
    selectedDayKey === todayKey
      ? 'היום'
      : selectedDayKey === yesterdayKey
        ? 'אתמול'
        : DATE_SELECTOR_LABEL_FORMATTER.format(
            new Date(dashboardDay?.dateContext?.dayStart ?? selectedDayStart)
          );
  const selectedPresetLabel =
    selectedPreset === 'custom'
      ? DATE_SELECTOR_LABEL_FORMATTER.format(
          new Date(dashboardDay?.dateContext?.dayStart ?? selectedDayStart)
        )
      : getPresetLabel(selectedPreset);

  const businessName =
    dashboardSummary?.business?.businessName?.trim() ||
    activeBusiness?.name?.trim() ||
    'העסק שלך';
  const logoUrl =
    dashboardSummary?.business?.logoUrl ?? activeBusiness?.logoUrl;

  const lifetimeMetrics = dashboardSummary?.lifetimeMetrics;
  const lifetimeItems = [
    {
      key: 'lifetime_stamps',
      label: 'סה"כ ניקובים',
      value: formatNumber(lifetimeMetrics?.totalStampsAllTime ?? 0),
      icon: 'ticket-outline' as const,
      tone: 'teal' as const,
      helperText: 'לכל התקופה',
    },
    {
      key: 'lifetime_redemptions',
      label: 'הטבות שמומשו',
      value: formatNumber(lifetimeMetrics?.totalRedemptionsAllTime ?? 0),
      icon: 'gift-outline' as const,
      tone: 'violet' as const,
      helperText: 'לכל התקופה',
    },
    {
      key: 'lifetime_joined_customers',
      label: 'לקוחות שהצטרפו',
      value: formatNumber(lifetimeMetrics?.totalCustomersJoinedAllTime ?? 0),
      icon: 'person-add-outline' as const,
      tone: 'blue' as const,
      helperText: 'לכל התקופה',
    },
    {
      key: 'lifetime_returning_customers',
      label: 'לקוחות חוזרים',
      value: formatNumber(lifetimeMetrics?.returningCustomersAllTime ?? 0),
      icon: 'people-outline' as const,
      tone: 'amber' as const,
      helperText: 'לכל התקופה',
    },
  ];

  const kpis = dashboardDay?.kpis;
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
      comparisonText: 'מאתמול',
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
      comparisonText: 'מאתמול',
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
      comparisonText: 'מאתמול',
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
      comparisonText: 'מאתמול',
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

  const activitySummaryTitle = `סקירה יומית (${selectedDayLabel})`;
  const activitySummaryItems = [
    {
      key: 'staff_scans',
      label: 'סריקות צוות',
      value: formatNumber(dashboardDay?.activitySummary?.staffScans ?? 0),
      tone: 'blue' as const,
    },
    {
      key: 'campaign_recipients',
      label: 'לקוחות מקמפיינים',
      value: formatNumber(
        dashboardDay?.activitySummary?.campaignRecipients ?? 0
      ),
      tone: 'teal' as const,
    },
    {
      key: 'active_programs',
      label: 'תוכניות פעילות',
      value: formatNumber(dashboardDay?.activitySummary?.activePrograms ?? 0),
      tone: 'violet' as const,
    },
    {
      key: 'rewards_redeemed',
      label: 'הטבות שמומשו',
      value: formatNumber(dashboardDay?.activitySummary?.rewardsRedeemed ?? 0),
      tone: 'amber' as const,
    },
  ];

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

  const handleSelectDateItem = (item: DateSelectorItem) => {
    setSelectedDayStart(item.anchor);

    if (item.key === todayKey) {
      setSelectedPreset('today');
      return;
    }
    if (item.key === yesterdayKey) {
      setSelectedPreset('yesterday');
      return;
    }
    setSelectedPreset('custom');
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
      setVisibleDayCount(7);
      setSelectedDayStart(anchorNow);
      return;
    }

    setSelectedPreset('last_30_days');
    setVisibleDayCount(30);
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
      stickyHeader={
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 8}
          backgroundColor="#F4F5FB"
        >
          <DashboardHeader
            businessName={businessName}
            logoUrl={logoUrl}
            onPressMenu={() =>
              openRoute('/(authenticated)/(business)/settings')
            }
          />
        </StickyScrollHeader>
      }
    >
      <View style={styles.content}>
        <LifetimeMetricsRow metrics={lifetimeItems} />

        <DateSelectorBar
          items={dateItems}
          selectedKey={selectedDayKey}
          selectedPresetLabel={selectedPresetLabel}
          onSelect={handleSelectDateItem}
          onSelectPreset={handleSelectPreset}
        />

        <DailyKpiGrid items={dailyKpiItems} />

        <SmartRecommendationsPanel
          cards={recommendationCards}
          onPressCta={(cardKey) => {
            void handleRecommendationCta(cardKey);
          }}
          onPressDetails={openRecommendationDetails}
          loadingCardKey={applyingRecommendationKey}
        />

        {dashboardDay?.activitySummary?.shouldRender ? (
          <CompactActivitySummaryRow
            title={activitySummaryTitle}
            items={activitySummaryItems}
          />
        ) : null}

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
    paddingTop: 8,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
