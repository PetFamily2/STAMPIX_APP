import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { BusinessStatusCard } from '@/components/business-dashboard/BusinessStatusCard';
import { CompactActivitySummaryRow } from '@/components/business-dashboard/CompactActivitySummaryRow';
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
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
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

function _formatSignedNumber(value: number) {
  const absoluteValue = formatNumber(Math.abs(value));
  if (value < 0) {
    return `↓ -${absoluteValue}`;
  }
  return `↑ ${value === 0 ? '0' : `+${absoluteValue}`}`;
}

function _getIsraelDayKey(timestamp: number) {
  return DAY_KEY_FORMATTER.format(new Date(timestamp));
}

function _buildKpiTrend(value: number, previousValue: number) {
  if (value === previousValue) {
    return { direction: 'up' as const, label: '↑ 0%' };
  }
  const delta = value - previousValue;
  if (previousValue <= 0) {
    if (delta < 0) {
      return {
        direction: 'down' as const,
        label: `↓ -${formatNumber(Math.abs(delta))}`,
      };
    }
    return {
      direction: 'up' as const,
      label: `↑ +${formatNumber(Math.abs(delta))}`,
    };
  }
  const percent = Math.round(Math.abs((delta / previousValue) * 100));
  const direction = delta > 0 ? ('up' as const) : ('down' as const);
  return {
    direction,
    label: `${direction === 'up' ? '↑' : '↓'} ${
      delta > 0 ? '+' : '-'
    }${percent}%`,
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
  const businessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canViewBillingState = businessCapabilities?.view_billing_state === true;
  const [selectedDayStart, setSelectedDayStart] = useState(() => Date.now());
  const [selectedPreset, setSelectedPreset] = useState<DatePresetKey>('today');
  const [applyingRecommendationKey, setApplyingRecommendationKey] = useState<
    string | null
  >(null);
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
  const executeRecommendationCta = useMutation(
    api.aiRecommendations.executeRecommendationPrimaryCta
  );
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
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
      value: formatNumber(
        lifetimeMetrics?.totalCustomersJoinedAllTime ?? 0
      ),
      icon: 'shield-checkmark-outline' as const,
      tone: 'amber' as const,
      helperValue: formatPeriodDelta(kpis?.activeCustomers ?? 0),
    },
    {
      key: 'lifetime_stamps',
      label: 'ניקובים',
      value: formatNumber(
        lifetimeMetrics?.totalStampsAllTime ?? 0
      ),
      icon: 'stamp-outline-custom' as const,
      tone: 'blue' as const,
      helperValue: formatPeriodDelta(kpis?.stamps?.value ?? 0),
    },
    {
      key: 'lifetime_redemptions',
      label: 'הטבות',
      value: formatNumber(
        lifetimeMetrics?.totalRedemptionsAllTime ?? 0
      ),
      icon: 'gift-outline-custom' as const,
      tone: 'violet' as const,
      helperValue: formatPeriodDelta(kpis?.redemptions?.value ?? 0),
    },
    {
      key: 'lifetime_returning_customers',
      label: 'לקוחות חוזרים',
      value: formatNumber(
        lifetimeMetrics?.returningCustomersAllTime ?? 0
      ),
      icon: 'people-outline' as const,
      tone: 'teal' as const,
      helperValue: formatPeriodDelta(kpis?.activeCustomers ?? 0),
    },
  ];

  const recommendationCards = useMemo(() => {
    const cards = (dashboardSummary?.recommendations?.cards ??
      []) as DashboardRecommendationCard[];
    const source = cards.length > 0 ? cards : buildEmptyRecommendationCards();
    const normalized = source.map((card) => ({
      ...card,
      primaryCtaLabel: card.primaryCta?.label
        ? localizeCtaLabel(card.primaryCta.label)
        : null,
    }));
    const hasAtRiskTask = normalized.some((card) => card.key === 'at_risk_task');
    if (!hasAtRiskTask) {
      normalized.unshift({
        key: 'at_risk_task',
        title: 'לקוחות בסיכון',
        body: `${formatNumber(kpis?.atRiskCustomers ?? 0)} לקוחות לא ביקרו לאחרונה`,
        evidenceTags: [],
        tone: 'critical',
        primaryCta: {
          kind: 'view_customers',
          label: 'פתח לקוחות',
          customerFilter: 'at_risk',
        },
        primaryCtaLabel: 'פתח לקוחות',
      });
    }
    return normalized;
  }, [dashboardSummary, kpis?.atRiskCustomers]);

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

  const handleShareBusinessReferral = useCallback(async () => {
    if (!activeBusinessId || isReferralShareLoading) {
      return;
    }

    try {
      setIsReferralShareLoading(true);
      const link = await createBusinessReferralLink({
        businessId: activeBusinessId,
      });
      const joinUrl = `https://app.stampaix.com/join?bref=${link.code}`;
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
  }, [
    activeBusinessId,
    createBusinessReferralLink,
    isReferralShareLoading,
  ]);

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
          <View style={styles.recommendationsCard}>
            <View style={styles.recommendationsHeader}>
              <View style={styles.recommendationsTopRow}>
                <Text className={tw.textStart} style={styles.recommendationsMeta}>
                  {`${Math.min(recommendationCards.length, 3)} פעולות פתוחות`}
                </Text>

                <View style={styles.recommendationsTitleRow}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color="#D97706"
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
                    נדרש טיפול
                  </Text>
                </View>
              </View>
            </View>

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
        </View>

        {Array.isArray(recentActivity) && recentActivity.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.activityHeadingRow}>
              <Pressable
                onPress={() =>
                  openRoute('/(authenticated)/(business)/analytics')
                }
                style={styles.activityActionButton}
              >
                <Text className={tw.textStart} style={styles.activityAction}>
                  הצג הכל
                </Text>
              </Pressable>
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
  },
  scroll: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
  },
  content: {
    paddingHorizontal: DASHBOARD_TOKENS.spacingPageHorizontal,
    paddingTop: 2,
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
  recommendationsSectionTitle: {
    textAlign: 'right',
    alignSelf: 'auto',
    writingDirection: 'rtl',
  },
  recommendationsCard: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  recommendationsHeader: {
    gap: 2,
  },
  recommendationsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  recommendationsTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  recommendationsMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#9A3412',
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  activityHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  activityActionButton: {
    transform: [{ translateX: 10 }],
  },
});
