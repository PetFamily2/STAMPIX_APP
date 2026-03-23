import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import {
  BarComparisonChart,
  InsightCard,
  KpiCard,
  LineTrendChart,
  SegmentedPillControl,
  SurfaceCard,
} from '@/components/business-ui';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';
import { CustomersHubContent } from './customers';

const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
type ReportsTopTab = 'reports' | 'customers';
const TOP_TABS: Array<{ key: ReportsTopTab; label: string }> = [
  { key: 'reports', label: 'דוחות' },
  { key: 'customers', label: 'לקוחות' },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatGrowth(value: number) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
}

function calculateGrowthFromWeekly(weekly?: Array<{ stamps: number }>) {
  if (!weekly || weekly.length < 2) {
    return 0;
  }
  const latestWeek = weekly[weekly.length - 1]?.stamps ?? 0;
  const previousWeek = weekly[weekly.length - 2]?.stamps ?? 0;
  if (previousWeek === 0) {
    return 0;
  }
  return Math.round(((latestWeek - previousWeek) / previousWeek) * 100);
}

function formatTrafficHighlights(
  items: Array<{ label: string; visits: number }> | undefined
) {
  if (!items || items.length === 0) {
    return '--';
  }
  return items
    .map((item) => `${item.label} (${formatNumber(item.visits)})`)
    .join(', ');
}

export function ReportsHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId } = useActiveBusiness();

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const advancedReportsGate = gate('advancedReports');
  const advancedReportsCopy = getLockedAreaCopy(
    'advancedReports',
    advancedReportsGate.requiredPlan
  );

  const basicAnalytics = useQuery(
    api.analytics.getBusinessActivity,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const advancedAnalytics = useQuery(
    api.analytics.getMerchantActivity,
    activeBusinessId && entitlements && !advancedReportsGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'premium' | null,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'feature_locked'
  ) => {
    openSubscriptionComparison(router, { featureKey, requiredPlan, reason });
  };

  const dailySeries = useMemo(() => {
    const rawDaily = basicAnalytics?.daily ?? [];
    const fallback = WEEKDAY_LABELS.map(() => 0);
    if (!rawDaily.length) {
      return fallback;
    }
    return rawDaily
      .slice(-WEEKDAY_LABELS.length)
      .map((day) => day.stamps)
      .concat(fallback)
      .slice(0, WEEKDAY_LABELS.length);
  }, [basicAnalytics]);

  const dailyChartData = useMemo(
    () =>
      WEEKDAY_LABELS.map((label, index) => ({
        label,
        value: dailySeries[index] ?? 0,
      })),
    [dailySeries]
  );

  const weeklyChartData = useMemo(() => {
    const rawWeekly = basicAnalytics?.weekly ?? [];
    if (rawWeekly.length === 0) {
      return dailyChartData.slice(0, 5).map((item, index) => ({
        label: `W${index + 1}`,
        value: item.value,
      }));
    }
    return rawWeekly.slice(-5).map((item, index) => ({
      label: `W${index + 1}`,
      value: item.stamps ?? 0,
    }));
  }, [basicAnalytics, dailyChartData]);

  const growthPercent =
    advancedAnalytics?.growthPercent ??
    calculateGrowthFromWeekly(basicAnalytics?.weekly);
  const trafficWindows = basicAnalytics?.trafficWindows;
  const weakWeekdaysLabel = formatTrafficHighlights(
    trafficWindows?.weakestWeekdays
  );
  const strongWeekdaysLabel = formatTrafficHighlights(
    trafficWindows?.strongestWeekdays
  );
  const weakHoursLabel = formatTrafficHighlights(
    trafficWindows?.weakestHourBlocks
  );
  const strongHoursLabel = formatTrafficHighlights(
    trafficWindows?.strongestHourBlocks
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: DASHBOARD_TOKENS.spacingPageHorizontal,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor={DASHBOARD_TOKENS.pageBackground}
        >
          <BusinessScreenHeader
            title="דוחות"
            subtitle="פעילות העסק, מגמות שימוש וצמיחה"
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.replace('/(authenticated)/(business)/dashboard')
                }
              />
            }
          />
        </StickyScrollHeader>

        <View style={styles.sectionTop}>
          <SegmentedPillControl<ReportsTopTab>
            items={TOP_TABS}
            value="reports"
            onChange={(nextTab) => {
              if (nextTab === 'customers') {
                router.setParams({ tab: 'customers' });
              }
            }}
          />
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCell}>
            <KpiCard
              label="ניקובים 7 ימים"
              value={formatNumber(basicAnalytics?.totals.stamps ?? 0)}
              icon="ticket-outline"
              tone="teal"
              trend={{
                direction:
                  growthPercent > 0
                    ? 'up'
                    : growthPercent < 0
                      ? 'down'
                      : 'flat',
                label: formatGrowth(growthPercent),
              }}
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="מימושים השבוע"
              value={formatNumber(basicAnalytics?.totals.redemptions ?? 0)}
              icon="gift-outline"
              tone="violet"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="לקוחות פעילים"
              value={formatNumber(basicAnalytics?.totals.uniqueCustomers ?? 0)}
              icon="people-outline"
              tone="blue"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="צמיחה תקופתית"
              value={
                advancedReportsGate.isLocked
                  ? '--'
                  : formatGrowth(growthPercent)
              }
              icon="trending-up-outline"
              tone="emerald"
              trend={{
                direction:
                  growthPercent > 0
                    ? 'up'
                    : growthPercent < 0
                      ? 'down'
                      : 'flat',
                label: 'לעומת שבוע קודם',
              }}
            />
          </View>
        </View>

        {basicAnalytics === undefined ? (
          <SurfaceCard style={styles.loadingCard}>
            <ActivityIndicator color={DASHBOARD_TOKENS.colors.brandBlue} />
          </SurfaceCard>
        ) : (
          <>
            <LineTrendChart
              title="מגמת ניקובים שבועית"
              subtitle="קו מגמה לפי 7 הימים האחרונים"
              data={dailyChartData}
              color={DASHBOARD_TOKENS.colors.brandBlue}
            />

            <BarComparisonChart
              title="השוואת שבועות"
              subtitle="השוואת ביקורים בין שבועות אחרונים"
              data={weeklyChartData}
              color={DASHBOARD_TOKENS.colors.teal}
            />
          </>
        )}

        <InsightCard
          title="אות צמיחה"
          body={
            advancedReportsGate.isLocked
              ? 'שדרוג למסלול מתקדם יפתח תובנות צמיחה והשוואה בין תקופות.'
              : `קצב הצמיחה הנוכחי עומד על ${formatGrowth(growthPercent)} לעומת התקופה הקודמת.`
          }
          tags={
            advancedReportsGate.isLocked
              ? ['נעול למסלול מתקדם']
              : ['מגמת צמיחה', 'פעילות בזמן אמת']
          }
          ctaLabel={advancedReportsGate.isLocked ? 'שדרוג' : undefined}
          onPress={
            advancedReportsGate.isLocked
              ? () =>
                  openUpgrade(
                    'advancedReports',
                    advancedReportsGate.requiredPlan,
                    advancedReportsGate.reason === 'subscription_inactive'
                      ? 'subscription_inactive'
                      : 'feature_locked'
                  )
              : undefined
          }
        />

        <SurfaceCard style={styles.trafficCard}>
          <View style={styles.trafficRows}>
            <View style={styles.trafficRow}>
              <View style={styles.trafficTagGood} />
              <View style={styles.trafficTextWrap}>
                <Text className={tw.textStart} style={styles.trafficLabel}>
                  ימים חזקים
                </Text>
                <Text className={tw.textStart} style={styles.trafficValue}>
                  {trafficWindows?.hasEnoughData ? strongWeekdaysLabel : '--'}
                </Text>
              </View>
            </View>
            <View style={styles.trafficRow}>
              <View style={styles.trafficTagWarn} />
              <View style={styles.trafficTextWrap}>
                <Text className={tw.textStart} style={styles.trafficLabel}>
                  ימים חלשים
                </Text>
                <Text className={tw.textStart} style={styles.trafficValue}>
                  {trafficWindows?.hasEnoughData ? weakWeekdaysLabel : '--'}
                </Text>
              </View>
            </View>
            <View style={styles.trafficRow}>
              <View style={styles.trafficTagGood} />
              <View style={styles.trafficTextWrap}>
                <Text className={tw.textStart} style={styles.trafficLabel}>
                  שעות חזקות
                </Text>
                <Text className={tw.textStart} style={styles.trafficValue}>
                  {trafficWindows?.hasEnoughData ? strongHoursLabel : '--'}
                </Text>
              </View>
            </View>
            <View style={styles.trafficRow}>
              <View style={styles.trafficTagWarn} />
              <View style={styles.trafficTextWrap}>
                <Text className={tw.textStart} style={styles.trafficLabel}>
                  שעות חלשות
                </Text>
                <Text className={tw.textStart} style={styles.trafficValue}>
                  {trafficWindows?.hasEnoughData ? weakHoursLabel : '--'}
                </Text>
              </View>
            </View>
          </View>
        </SurfaceCard>

        <FeatureGate
          isLocked={advancedReportsGate.isLocked}
          requiredPlan={advancedReportsGate.requiredPlan}
          onUpgradeClick={() =>
            openUpgrade(
              'advancedReports',
              advancedReportsGate.requiredPlan,
              advancedReportsGate.reason === 'subscription_inactive'
                ? 'subscription_inactive'
                : 'feature_locked'
            )
          }
          title={advancedReportsCopy.lockedTitle}
          subtitle={advancedReportsCopy.lockedSubtitle}
          benefits={advancedReportsCopy.benefits}
        >
          <SurfaceCard style={styles.advancedCard}>
            <InsightCard
              title="תובנה מתקדמת"
              body={
                advancedReportsGate.isLocked
                  ? 'שדרוג למסלול מתקדם מאפשר ניתוחים השוואתיים עמוקים יותר.'
                  : 'נתוני הצמיחה וההשוואות מוצגים בזמן אמת ויכולים להנחות את הקמפיין הבא.'
              }
              tags={
                advancedReportsGate.isLocked
                  ? ['Advanced Reports']
                  : ['Growth', 'Comparison']
              }
            />
          </SurfaceCard>
        </FeatureGate>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function BusinessAnalyticsScreen() {
  const { tab } = useLocalSearchParams<{
    tab?: string;
  }>();

  if (tab === 'customers') {
    return <CustomersHubContent />;
  }

  return <ReportsHubContent />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
  },
  scroll: {
    flex: 1,
  },
  sectionTop: {
    marginTop: 4,
  },
  kpiGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCell: {
    width: '48%',
  },
  loadingCard: {
    marginTop: 16,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trafficCard: {
    marginTop: 16,
  },
  trafficRows: {
    gap: 10,
  },
  trafficRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  trafficTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  trafficLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  trafficValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  trafficTagGood: {
    marginTop: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  trafficTagWarn: {
    marginTop: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  advancedCard: {
    marginTop: 16,
  },
});
