import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { KpiCard, LineTrendChart, SurfaceCard } from '@/components/business-ui';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

type BusinessRoute =
  | '/(authenticated)/(business)/customers'
  | '/(authenticated)/(business)/programs'
  | '/(authenticated)/(business)/campaigns'
  | '/(authenticated)/(business)/scanner'
  | '/(authenticated)/(business)/team'
  | '/(authenticated)/(business)/settings'
  | '/(authenticated)/(business)/settings-business-profile'
  | '/(authenticated)/(business)/settings-business-subscription';

type CustomerRouteFilter =
  | 'near_reward'
  | 'at_risk'
  | 'new_customers'
  | 'reward_eligible';

type RecommendationCard = {
  title: string;
  body: string;
  sectionTitle: string;
  supportingText?: string;
  evidenceTags: string[];
  primaryCta?: {
    kind: string;
    label: string;
    draftType?: string | null;
    customerFilter?: string | null;
  };
  statusTone?: string | null;
};

type RecentActivityItem = {
  id: string;
  type: 'reward' | 'stamp';
  customer: string;
  detail: string;
  timeLabel: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function localizeAiCtaLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'create first campaign') {
    return 'יצירת קמפיין ראשון';
  }
  if (normalized === 'create welcome campaign') {
    return 'יצירת קמפיין קבלת פנים';
  }
  if (normalized === 'create winback campaign') {
    return 'יצירת קמפיין החזרה';
  }
  if (normalized === 'view eligible customers') {
    return 'צפייה בלקוחות מתאימים';
  }
  if (normalized === 'create first card') {
    return 'יצירת כרטיס ראשון';
  }
  if (normalized === 'finish setup') {
    return 'השלמת ההגדרה';
  }
  if (normalized === 'view subscription') {
    return 'צפייה במנוי';
  }
  return label;
}

function getRecommendationTheme(statusTone?: string | null) {
  if (statusTone === 'wait') {
    return {
      card: 'border-[#D6E4FF] bg-[#F8FBFF]',
      eyebrow: 'text-[#64748B]',
      title: 'text-[#0F294B]',
      body: 'text-[#334155]',
      chip: 'border-[#D6E4FF] bg-white text-[#1E3A8A]',
      button: 'bg-[#1D4ED8]',
    };
  }
  if (statusTone === 'stable') {
    return {
      card: 'border-[#BBF7D0] bg-[#F0FDF4]',
      eyebrow: 'text-[#166534]',
      title: 'text-[#14532D]',
      body: 'text-[#166534]',
      chip: 'border-[#BBF7D0] bg-white text-[#166534]',
      button: 'bg-[#15803D]',
    };
  }
  return {
    card: 'border-[#BFDBFE] bg-[#EFF6FF]',
    eyebrow: 'text-[#475569]',
    title: 'text-[#1E3A8A]',
    body: 'text-[#334155]',
    chip: 'border-[#BFDBFE] bg-white text-[#1D4ED8]',
    button: 'bg-[#1D4ED8]',
  };
}

function buildFallbackRecommendation(input: {
  businessName: string;
  attentionTitle?: string;
  attentionSubtitle?: string;
  stamps7d: number;
  redemptions7d: number;
  activeCustomers: number;
}): RecommendationCard {
  if (input.attentionTitle && input.attentionSubtitle) {
    return {
      sectionTitle: 'הצעד הבא לעסק',
      title: input.attentionTitle,
      body: input.attentionSubtitle,
      evidenceTags: [
        `${formatNumber(input.stamps7d)} ניקובים / 7 ימים`,
        `${formatNumber(input.redemptions7d)} מימושים / 7 ימים`,
        `${formatNumber(input.activeCustomers)} לקוחות פעילים`,
      ],
      primaryCta: undefined,
      statusTone: 'wait',
    };
  }

  return {
    sectionTitle: 'הצעד הבא לעסק',
    title: 'אין כרגע פעולה דחופה',
    body: `${input.businessName} יציב כרגע. ממשיכים לעקוב אחרי הפעילות ומחכים לאות הבא.`,
    evidenceTags: [
      `${formatNumber(input.stamps7d)} ניקובים / 7 ימים`,
      `${formatNumber(input.redemptions7d)} מימושים / 7 ימים`,
      `${formatNumber(input.activeCustomers)} לקוחות פעילים`,
    ],
    primaryCta: undefined,
    statusTone: 'stable',
  };
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
  const { activeBusinessId, activeBusiness } = useActiveBusiness();

  const dashboardSummary = useQuery(
    api.dashboard.getBusinessDashboardSummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const executeRecommendationCta = useMutation(
    api.aiRecommendations.executeRecommendationPrimaryCta
  );
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const [isApplyingRecommendation, setIsApplyingRecommendation] =
    useState(false);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const businessName =
    dashboardSummary?.businessProfile?.businessName?.trim() ||
    activeBusiness?.name?.trim() ||
    'העסק שלך';
  const kpis = dashboardSummary?.kpiMetrics;
  const stamps7d = kpis?.stamps7d ?? 0;
  const redemptions7d = kpis?.redemptions7d ?? 0;
  const activeCustomers = kpis?.activeCustomers ?? 0;
  const dailyActivity = dashboardSummary?.sources?.activity?.daily ?? [];
  const recentActivity = (dashboardSummary?.recentActivity ??
    []) as RecentActivityItem[];
  const attentionSignal = dashboardSummary?.attentionSignals?.[0];
  const rawRecommendation = dashboardSummary?.aiRecommendation as
    | (RecommendationCard & { recommendationId?: string })
    | null
    | undefined;

  const graphData = useMemo(() => {
    if (dailyActivity.length === 0) {
      return Array.from({ length: 7 }, (_unused, index) => ({
        label: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][index] ?? '-',
        value: 0,
      }));
    }

    return dailyActivity
      .slice(-7)
      .map((day: { start?: number; stamps?: number }) => ({
        label:
          typeof day.start === 'number'
            ? new Date(day.start).toLocaleDateString('he-IL', {
                weekday: 'narrow',
              })
            : '-',
        value: Number(day.stamps ?? 0),
      }));
  }, [dailyActivity]);

  const recommendationCard = useMemo<RecommendationCard>(() => {
    if (rawRecommendation) {
      return {
        sectionTitle: rawRecommendation.sectionTitle ?? 'הצעד הבא לעסק',
        title: rawRecommendation.title,
        body: rawRecommendation.body,
        supportingText: rawRecommendation.supportingText ?? '',
        evidenceTags: rawRecommendation.evidenceTags ?? [],
        primaryCta: rawRecommendation.primaryCta ?? undefined,
        statusTone: rawRecommendation.statusTone ?? null,
      };
    }

    return buildFallbackRecommendation({
      businessName,
      attentionTitle: attentionSignal?.title,
      attentionSubtitle: attentionSignal?.subtitle,
      stamps7d,
      redemptions7d,
      activeCustomers,
    });
  }, [
    activeCustomers,
    attentionSignal?.subtitle,
    attentionSignal?.title,
    businessName,
    rawRecommendation,
    redemptions7d,
    stamps7d,
  ]);

  const recommendationTheme = getRecommendationTheme(
    recommendationCard.statusTone
  );
  const recommendationHasCta = Boolean(
    recommendationCard.primaryCta?.kind &&
      recommendationCard.primaryCta.kind !== 'none'
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
    kind: string;
    draftType?: string | null;
    customerFilter?: string | null;
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
        openCustomersWithFilter(
          primaryCta.customerFilter === 'near_reward' ||
            primaryCta.customerFilter === 'at_risk' ||
            primaryCta.customerFilter === 'new_customers'
            ? primaryCta.customerFilter
            : null
        );
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

  const handleRecommendationCta = async () => {
    if (
      !activeBusinessId ||
      !recommendationHasCta ||
      !recommendationCard.primaryCta ||
      isApplyingRecommendation
    ) {
      return;
    }

    setIsApplyingRecommendation(true);
    try {
      if (!rawRecommendation?.recommendationId) {
        await openRecommendationTarget(recommendationCard.primaryCta);
        return;
      }

      const result = await executeRecommendationCta({
        businessId: activeBusinessId,
        recommendationId: rawRecommendation.recommendationId as never,
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
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא הצלחנו לפתוח את ההמלצה.'
      );
    } finally {
      setIsApplyingRecommendation(false);
    }
  };

  const kpiItems = [
    {
      key: 'stamps7d',
      label: 'ניקובים 7 ימים',
      value: formatNumber(stamps7d),
      icon: 'ticket-outline' as const,
      tone: 'teal' as const,
      onPress: () => openRoute('/(authenticated)/(business)/scanner'),
    },
    {
      key: 'redemptions7d',
      label: 'מימושים 7 ימים',
      value: formatNumber(redemptions7d),
      icon: 'gift-outline' as const,
      tone: 'violet' as const,
      onPress: () => openRoute('/(authenticated)/(business)/programs'),
    },
    {
      key: 'activeCustomers',
      label: 'לקוחות פעילים',
      value: formatNumber(activeCustomers),
      icon: 'people-outline' as const,
      tone: 'blue' as const,
      onPress: () => openRoute('/(authenticated)/(business)/customers'),
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title={businessName}
            subtitle="תמונת מצב עסקית, אותות ברורים והצעד הבא"
            brandAccessory={
              <TouchableOpacity
                onPress={() =>
                  openRoute('/(authenticated)/(business)/settings')
                }
                className="h-10 w-10 items-center justify-center rounded-xl border border-[#D6E4FF] bg-white"
              >
                <Ionicons name="settings-outline" size={20} color="#1D4ED8" />
              </TouchableOpacity>
            }
          />
        </StickyScrollHeader>

        <View className="mt-4">
          <Text className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}>
            סיכום מהיר
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-3">
            {kpiItems.map((item) => (
              <View key={item.key} className="w-[48%]">
                <KpiCard
                  label={item.label}
                  value={item.value}
                  icon={item.icon}
                  tone={item.tone}
                  onPress={item.onPress}
                />
              </View>
            ))}
          </View>
        </View>

        <View className="mt-4">
          <LineTrendChart
            title="פעילות 7 הימים האחרונים"
            subtitle={`ניקובים יומיים · ${formatNumber(redemptions7d)} מימושים ב-7 ימים`}
            data={graphData}
          />
        </View>

        <SurfaceCard
          style={{ marginTop: 16 }}
          tone="insight"
          radius="hero"
          padding="lg"
        >
          <Text
            className={`text-xs font-black ${recommendationTheme.eyebrow} ${tw.textStart}`}
          >
            {recommendationCard.sectionTitle}
          </Text>
          <Text
            className={`mt-2 text-xl font-black ${recommendationTheme.title} ${tw.textStart}`}
          >
            {recommendationCard.title}
          </Text>
          <Text
            className={`mt-2 text-sm ${recommendationTheme.body} ${tw.textStart}`}
          >
            {recommendationCard.body}
          </Text>
          {recommendationCard.supportingText ? (
            <Text className={`mt-3 text-xs text-[#64748B] ${tw.textStart}`}>
              {recommendationCard.supportingText}
            </Text>
          ) : null}

          {recommendationCard.evidenceTags.length > 0 ? (
            <View className={`${tw.flexRow} mt-3 flex-wrap gap-2`}>
              {recommendationCard.evidenceTags.slice(0, 3).map((tag) => (
                <View
                  key={tag}
                  className={`rounded-full border px-3 py-1 ${recommendationTheme.chip}`}
                >
                  <Text className="text-[11px] font-bold">{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {recommendationHasCta ? (
            <TouchableOpacity
              onPress={() => {
                void handleRecommendationCta();
              }}
              disabled={isApplyingRecommendation}
              className={`mt-4 ${tw.selfStart} rounded-xl px-4 py-2.5 ${
                isApplyingRecommendation
                  ? 'bg-[#CBD5E1]'
                  : recommendationTheme.button
              }`}
            >
              {isApplyingRecommendation ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">
                  {localizeAiCtaLabel(
                    recommendationCard.primaryCta?.label ?? 'צפייה'
                  )}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </SurfaceCard>

        <View className="mt-5">
          <View className={`${tw.flexRow} items-center justify-between`}>
            <Text
              className={`text-lg font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              פעילות אחרונה
            </Text>
            <Text className="text-xs font-bold text-[#2563EB]">
              {formatNumber(Math.min(recentActivity.length, 5))} פריטים
            </Text>
          </View>

          {dashboardSummary === undefined ? (
            <SurfaceCard style={{ marginTop: 12 }}>
              <View className="items-center justify-center py-8">
                <ActivityIndicator color="#2F6BFF" />
              </View>
            </SurfaceCard>
          ) : recentActivity.length === 0 ? (
            <SurfaceCard style={{ marginTop: 12 }}>
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                עדיין אין פעילות אחרונה להצגה.
              </Text>
            </SurfaceCard>
          ) : (
            <View className="mt-3 gap-2">
              {recentActivity.slice(0, 5).map((item) => (
                <SurfaceCard key={item.id} padding="sm" elevated={false}>
                  <View className={`${tw.flexRow} items-center gap-3`}>
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#F1F5F9]">
                      <Ionicons
                        name={
                          item.type === 'reward'
                            ? 'gift-outline'
                            : 'scan-outline'
                        }
                        size={18}
                        color="#475569"
                      />
                    </View>
                    <View className="flex-1 items-end">
                      <Text
                        className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {item.customer}
                      </Text>
                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        {item.detail}
                      </Text>
                    </View>
                    <Text className="rounded-full bg-[#EEF3FF] px-3 py-1 text-[11px] font-bold text-[#2F6BFF]">
                      {item.timeLabel}
                    </Text>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
