import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import {
  DonutChartCard,
  HorizontalRankingChart,
  InsightCard,
  KpiCard,
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
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type CustomerRouteFilter =
  | 'near_reward'
  | 'at_risk'
  | 'new_customers'
  | 'reward_eligible';
type CustomerState =
  | 'NEW'
  | 'ACTIVE'
  | 'NEEDS_NURTURE'
  | 'NEEDS_WINBACK'
  | 'CLOSE_TO_REWARD';
type CustomerValueTier = 'REGULAR' | 'LOYAL' | 'VIP';

type CustomerRow = {
  primaryMembershipId: string;
  customerId: string;
  name: string;
  phone?: string | null;
  customerState?: string | null;
  customerValueTier?: string | null;
  lastVisitDaysAgo: number;
  visitCount: number;
  primaryProgramName: string;
  rewardThreshold: number;
  loyaltyProgress: number;
};

const _TOP_TABS = [
  { key: 'reports', label: 'דוחות' },
  { key: 'customers', label: 'לקוחות' },
];

const STATE_LABELS: Record<CustomerState, string> = {
  NEW: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'דורש חימום',
  NEEDS_WINBACK: 'דורש חזרה',
  CLOSE_TO_REWARD: 'קרוב להטבה',
};

const VALUE_TIER_LABELS: Record<CustomerValueTier, string> = {
  REGULAR: 'Regular',
  LOYAL: 'Loyal',
  VIP: 'VIP',
};

const STATE_COLORS: Record<CustomerState, { bg: string; fg: string }> = {
  NEW: { bg: '#E0F2FE', fg: '#0369A1' },
  ACTIVE: { bg: '#EEF2FF', fg: '#3730A3' },
  NEEDS_NURTURE: { bg: '#FFEDD5', fg: '#C2410C' },
  NEEDS_WINBACK: { bg: '#FEE2E2', fg: '#B91C1C' },
  CLOSE_TO_REWARD: { bg: '#FEF3C7', fg: '#B45309' },
};

const VALUE_TIER_COLORS: Record<CustomerValueTier, { bg: string; fg: string }> =
  {
    REGULAR: { bg: '#E2E8F0', fg: '#334155' },
    LOYAL: { bg: '#E0E7FF', fg: '#4338CA' },
    VIP: { bg: '#F3E8FF', fg: '#7E22CE' },
  };

function resolveCustomerState(customer: {
  customerState?: string | null;
}): CustomerState {
  if (
    customer.customerState === 'NEW' ||
    customer.customerState === 'ACTIVE' ||
    customer.customerState === 'NEEDS_NURTURE' ||
    customer.customerState === 'NEEDS_WINBACK' ||
    customer.customerState === 'CLOSE_TO_REWARD'
  ) {
    return customer.customerState;
  }
  return 'ACTIVE';
}

function resolveCustomerValueTier(customer: {
  customerValueTier?: string | null;
}): CustomerValueTier {
  if (
    customer.customerValueTier === 'REGULAR' ||
    customer.customerValueTier === 'LOYAL' ||
    customer.customerValueTier === 'VIP'
  ) {
    return customer.customerValueTier;
  }
  return 'REGULAR';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatLastVisit(daysAgo: number) {
  if (daysAgo <= 0) {
    return 'היום';
  }
  if (daysAgo === 1) {
    return 'אתמול';
  }
  return `לפני ${daysAgo} ימים`;
}

function buildActiveFilterLabel(activeFilter: CustomerRouteFilter) {
  if (activeFilter === 'near_reward') {
    return 'מסונן: קרובים להטבה';
  }
  if (activeFilter === 'at_risk') {
    return 'מסונן: לקוחות בסיכון';
  }
  if (activeFilter === 'reward_eligible') {
    return 'מסונן: זכאים למימוש';
  }
  return 'מסונן: לקוחות חדשים';
}

export function CustomersHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, filter } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    filter?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const activeFilter: CustomerRouteFilter | null =
    filter === 'near_reward' ||
    filter === 'at_risk' ||
    filter === 'new_customers' ||
    filter === 'reward_eligible'
      ? filter
      : null;

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canCreateCampaigns = businessCapabilities?.create_campaigns === true;
  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const smartGate = gate('smartAnalytics');
  const smartCopy = getLockedAreaCopy('smartAnalytics', smartGate.requiredPlan);
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const customerList = (useQuery(
    api.customerCards.listBusinessCustomersBase,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  ) ?? []) as CustomerRow[];
  const snapshot = useQuery(
    api.events.getCustomerManagementSnapshot,
    activeBusinessId && entitlements && !smartGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const rewardEligibilitySummary = useQuery(
    api.memberships.getBusinessRewardEligibilitySummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const [search, setSearch] = useState('');
  const [isCreatingWinbackCampaign, setIsCreatingWinbackCampaign] =
    useState(false);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

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

  const openCampaigns = () => {
    router.push('/(authenticated)/(business)/campaigns');
  };

  const summary = snapshot?.summary ?? {
    totalCustomers: 0,
    activeCustomers: 0,
    needsNurtureCustomers: 0,
    needsWinbackCustomers: 0,
    closeToRewardCustomers: 0,
    loyalCustomers: 0,
    atRiskCustomers: 0,
    nearRewardCustomers: 0,
    vipCustomers: 0,
    newCustomers: 0,
  };

  const needsAttentionCustomersRaw =
    (summary.needsNurtureCustomers ?? 0) + (summary.needsWinbackCustomers ?? 0);
  const needsAttentionCustomers =
    needsAttentionCustomersRaw > 0
      ? needsAttentionCustomersRaw
      : (summary.atRiskCustomers ?? 0);
  const closeToRewardCustomers =
    (summary.closeToRewardCustomers ?? 0) > 0
      ? summary.closeToRewardCustomers
      : (summary.nearRewardCustomers ?? 0);
  const rewardEligibleCustomers =
    rewardEligibilitySummary?.redeemableCustomers ?? 0;
  const rewardEligibleCards = rewardEligibilitySummary?.redeemableCards ?? 0;
  const showAtRiskActionCard =
    activeFilter === 'at_risk' ||
    (!smartGate.isLocked && needsAttentionCustomers > 0);

  const handleCreateAtRiskCampaign = async () => {
    if (!activeBusinessId || isCreatingWinbackCampaign) {
      return;
    }

    if (!canCreateCampaigns) {
      Alert.alert(
        'אין הרשאה',
        'רק בעלים או מנהלים יכולים ליצור קמפיין ללקוחות בסיכון.'
      );
      return;
    }

    setIsCreatingWinbackCampaign(true);
    try {
      const created = await createCampaignDraft({
        businessId: activeBusinessId,
        type: 'winback',
        rules: { audience: 'inactive_days', daysInactive: 30 },
      });

      router.push({
        pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
        params: {
          campaignId: String(created.campaignId),
          businessId: String(activeBusinessId),
        },
      });
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'לא ניתן ליצור קמפיין',
          entitlementErrorToHebrewMessage(entitlementError),
          [
            {
              text: 'שדרוג',
              onPress: () =>
                openUpgrade(
                  'marketingHub',
                  entitlementError.requiredPlan ?? null,
                  entitlementError.code === 'SUBSCRIPTION_INACTIVE'
                    ? 'subscription_inactive'
                    : 'feature_locked'
                ),
            },
            { text: 'אישור', style: 'cancel' },
          ]
        );
        return;
      }

      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת קמפיין החזרה נכשלה.'
      );
    } finally {
      setIsCreatingWinbackCampaign(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const routeFilteredCustomers = activeFilter
      ? customerList.filter((customer) => {
          const state = resolveCustomerState(customer);
          if (activeFilter === 'near_reward') {
            return state === 'CLOSE_TO_REWARD';
          }
          if (activeFilter === 'at_risk') {
            return state === 'NEEDS_NURTURE' || state === 'NEEDS_WINBACK';
          }
          if (activeFilter === 'reward_eligible') {
            return (
              Number(customer.rewardThreshold) > 0 &&
              Number(customer.loyaltyProgress) >=
                Number(customer.rewardThreshold)
            );
          }
          return state === 'NEW';
        })
      : customerList;
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return routeFilteredCustomers;
    }
    return routeFilteredCustomers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [activeFilter, customerList, search]);

  const customerHealthChart = useMemo(
    () => [
      {
        label: 'פעילים',
        value: smartGate.isLocked ? 0 : summary.activeCustomers,
        color: '#1E4ED8',
      },
      {
        label: 'בסיכון',
        value: smartGate.isLocked ? 0 : needsAttentionCustomers,
        color: '#EF4444',
      },
      {
        label: 'חדשים',
        value: smartGate.isLocked ? 0 : summary.newCustomers,
        color: '#06B6D4',
      },
      {
        label: 'VIP / Loyal',
        value: smartGate.isLocked
          ? 0
          : (summary.vipCustomers ?? 0) + (summary.loyalCustomers ?? 0),
        color: '#8B5CF6',
      },
    ],
    [smartGate.isLocked, summary, needsAttentionCustomers]
  );

  const topActiveCustomers = useMemo(
    () =>
      customerList
        .slice()
        .sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0))
        .slice(0, 5)
        .map((customer) => ({
          label: customer.name,
          value: Number(customer.visitCount ?? 0),
        })),
    [customerList]
  );

  const openCustomerCard = (customerUserId: string) => {
    router.push({
      pathname: '/(authenticated)/(business)/customer/[customerUserId]',
      params: { customerUserId },
    });
  };

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
            title="לקוחות"
            subtitle="מצב לקוחות, דרגות ערך ותובנות"
          />
        </StickyScrollHeader>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCell}>
            <KpiCard
              label="לקוחות פעילים"
              value={
                smartGate.isLocked
                  ? '--'
                  : formatNumber(summary.activeCustomers)
              }
              icon="people-outline"
              tone="blue"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="לקוחות בסיכון"
              value={
                smartGate.isLocked
                  ? '--'
                  : formatNumber(needsAttentionCustomers)
              }
              icon="alert-circle-outline"
              tone="red"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="קרובים להטבה"
              value={
                smartGate.isLocked ? '--' : formatNumber(closeToRewardCustomers)
              }
              icon="gift-outline"
              tone="amber"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="VIP / Loyal"
              value={
                smartGate.isLocked
                  ? '--'
                  : `${formatNumber(summary.vipCustomers ?? 0)} / ${formatNumber(summary.loyalCustomers ?? 0)}`
              }
              icon="diamond-outline"
              tone="violet"
            />
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <FeatureGate
            isLocked={smartGate.isLocked}
            requiredPlan={smartGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'smartAnalytics',
                smartGate.requiredPlan,
                smartGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={smartCopy.lockedTitle}
            subtitle={smartCopy.lockedSubtitle}
            benefits={smartCopy.benefits}
          >
            <View style={styles.analyticsStack}>
              <DonutChartCard
                title="הרכב בריאות לקוחות"
                subtitle="פילוח מצב הלקוחות בעסק"
                centerLabel="סה״כ לקוחות"
                centerValue={
                  smartGate.isLocked
                    ? '--'
                    : formatNumber(summary.totalCustomers)
                }
                data={customerHealthChart}
              />
              <HorizontalRankingChart
                title="לקוחות פעילים מובילים"
                subtitle="דירוג לפי מספר ביקורים"
                data={topActiveCustomers}
                color={DASHBOARD_TOKENS.colors.violet}
              />
              <InsightCard
                title="תובנת שימור"
                body={
                  smartGate.isLocked
                    ? 'שדרוג למסלול מתקדם יפתח תובנות לקוחות בזמן אמת.'
                    : `יש כרגע ${formatNumber(closeToRewardCustomers)} לקוחות קרובים להטבה ו-${formatNumber(
                        needsAttentionCustomers
                      )} שדורשים פעולה.`
                }
                tags={[
                  `זכאים למימוש: ${smartGate.isLocked ? '--' : formatNumber(rewardEligibleCustomers)}`,
                  `כרטיסיות מלאות: ${smartGate.isLocked ? '--' : formatNumber(rewardEligibleCards)}`,
                ]}
              />
            </View>
          </FeatureGate>
        </View>

        {showAtRiskActionCard ? (
          <SurfaceCard style={styles.atRiskActionCard}>
            <View style={styles.atRiskActionHeader}>
              <View style={styles.atRiskIconWrap}>
                <Ionicons name="refresh-outline" size={22} color="#0F766E" />
              </View>
              <View style={styles.atRiskCopy}>
                <Text className={tw.textStart} style={styles.atRiskTitle}>
                  פעולה ללקוחות בסיכון
                </Text>
                <Text className={tw.textStart} style={styles.atRiskBody}>
                  צרו הודעת "לא ראינו אתכם לאחרונה" עם הטבה, ערכו את הנוסח ושלחו
                  אותה ללקוחות שלא חזרו בזמן.
                </Text>
              </View>
            </View>

            <View style={styles.atRiskActions}>
              <Pressable
                disabled={isCreatingWinbackCampaign || !canCreateCampaigns}
                onPress={() => {
                  void handleCreateAtRiskCampaign();
                }}
                style={({ pressed }) => [
                  styles.primaryAction,
                  (!canCreateCampaigns || isCreatingWinbackCampaign) &&
                    styles.actionDisabled,
                  pressed && canCreateCampaigns
                    ? styles.primaryActionPressed
                    : null,
                ]}
              >
                {isCreatingWinbackCampaign ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="megaphone-outline"
                      size={17}
                      color="#FFFFFF"
                    />
                    <Text style={styles.primaryActionText}>
                      צרו קמפיין החזרה
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={openCampaigns}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed ? styles.secondaryActionPressed : null,
                ]}
              >
                <Text style={styles.secondaryActionText}>כל הקמפיינים</Text>
              </Pressable>
            </View>

            {!canCreateCampaigns ? (
              <Text className={tw.textStart} style={styles.permissionHint}>
                למשתמש הנוכחי אין הרשאה ליצור קמפיינים.
              </Text>
            ) : null}
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={20} color="#B0BAC8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="חיפוש לקוח לפי שם או טלפון"
              placeholderTextColor="#B0BAC8"
              className={tw.textStart}
              style={styles.searchInput}
            />
          </View>
        </SurfaceCard>

        <View style={styles.listHeader}>
          <Text
            style={styles.listHeaderText}
          >{`${formatNumber(filteredCustomers.length)} לקוחות`}</Text>
          <Text
            style={styles.listHeaderText}
          >{`${formatNumber(customerList.length)} סה"כ`}</Text>
        </View>

        {activeFilter ? (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>
              {buildActiveFilterLabel(activeFilter)}
            </Text>
          </View>
        ) : null}

        <View style={styles.listWrap}>
          {customerList.length === 0 ? (
            <SurfaceCard>
              <Text className={tw.textStart} style={styles.emptyText}>
                אין עדיין לקוחות להצגה.
              </Text>
            </SurfaceCard>
          ) : filteredCustomers.length === 0 ? (
            <SurfaceCard>
              <Text className={tw.textStart} style={styles.emptyText}>
                לא נמצאו לקוחות התואמים לחיפוש.
              </Text>
            </SurfaceCard>
          ) : (
            filteredCustomers.map((customer) => {
              const customerState = resolveCustomerState(customer);
              const customerValueTier = resolveCustomerValueTier(customer);
              return (
                <Pressable
                  key={customer.primaryMembershipId}
                  onPress={() => openCustomerCard(String(customer.customerId))}
                  style={styles.customerCard}
                >
                  <View style={styles.customerRow}>
                    <View style={styles.avatar}>
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color="#2F6BFF"
                      />
                    </View>

                    <View style={styles.customerMain}>
                      <Text
                        className={tw.textStart}
                        style={styles.customerName}
                      >
                        {customer.name}
                      </Text>
                      <Text
                        className={tw.textStart}
                        style={styles.customerSecondary}
                      >
                        {customer.phone ?? 'ללא טלפון'}
                      </Text>
                      <View style={styles.badges}>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: STATE_COLORS[customerState].bg,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: STATE_COLORS[customerState].fg },
                            ]}
                          >
                            {STATE_LABELS[customerState]}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor:
                                VALUE_TIER_COLORS[customerValueTier].bg,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              {
                                color: VALUE_TIER_COLORS[customerValueTier].fg,
                              },
                            ]}
                          >
                            {VALUE_TIER_LABELS[customerValueTier]}
                          </Text>
                        </View>
                      </View>
                      <Text
                        className={tw.textStart}
                        style={styles.progressText}
                      >
                        התקדמות להטבה: {customer.loyaltyProgress}/
                        {customer.rewardThreshold}
                      </Text>
                    </View>

                    <View style={styles.customerMeta}>
                      <Text className={tw.textStart} style={styles.metaTitle}>
                        ביקור אחרון
                      </Text>
                      <Text className={tw.textStart} style={styles.metaValue}>
                        {formatLastVisit(customer.lastVisitDaysAgo)}
                      </Text>
                      <Text className={tw.textStart} style={styles.metaSub}>
                        {customer.visitCount} ביקורים ·{' '}
                        {customer.primaryProgramName}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function BusinessCustomersRoute() {
  return <CustomersHubContent />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
  },
  scroll: {
    flex: 1,
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
  analyticsStack: {
    gap: 14,
  },
  searchCard: {
    marginTop: 18,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A2B4A',
  },
  listHeader: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  atRiskActionCard: {
    marginTop: 16,
  },
  atRiskActionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
  },
  atRiskIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CCFBF1',
  },
  atRiskCopy: {
    flex: 1,
    minWidth: 0,
  },
  atRiskTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: '#0F172A',
  },
  atRiskBody: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#64748B',
  },
  atRiskActions: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  primaryAction: {
    minHeight: 44,
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 7,
    paddingHorizontal: 14,
  },
  primaryActionPressed: {
    opacity: 0.88,
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFE7E2',
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryActionPressed: {
    opacity: 0.82,
  },
  actionDisabled: {
    backgroundColor: '#CBD5E1',
  },
  primaryActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  secondaryActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#0F766E',
  },
  permissionHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#B45309',
  },
  filterBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#E8F1FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  listWrap: {
    marginTop: 10,
    gap: 12,
  },
  customerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E9F4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECF1FF',
  },
  customerMain: {
    flex: 1,
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F294B',
  },
  customerSecondary: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#8A97AC',
  },
  badges: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  customerMeta: {
    minWidth: 92,
    alignItems: 'flex-end',
  },
  metaTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  metaValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
