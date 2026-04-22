import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';

type RewardType = 'STAMP' | 'BENEFIT';
type RewardRecipients = 'referrer' | 'referred' | 'both';
type MonthlyLimit = 'unlimited' | 5 | 10 | 20 | 50;
type BenefitExpiration = 14 | 30 | 60 | 90;
type ReferralTab = 'settings' | 'customers' | 'rewards' | 'performance';

const MONTHLY_LIMIT_OPTIONS: MonthlyLimit[] = ['unlimited', 5, 10, 20, 50];
const BENEFIT_EXPIRATION_OPTIONS: BenefitExpiration[] = [14, 30, 60, 90];

function normalizeTab(value: string | undefined): ReferralTab {
  if (
    value === 'settings' ||
    value === 'customers' ||
    value === 'rewards' ||
    value === 'performance'
  ) {
    return value;
  }
  return 'settings';
}

export default function BusinessReferralSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();

  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;

  const canViewSettings = capabilities?.view_settings === true;
  const canEditConfig = capabilities?.edit_loyalty_cards === true;
  const canViewDashboard = capabilities?.access_dashboard === true;
  const canViewCustomers = capabilities?.access_customers === true;
  const canViewBilling = capabilities?.view_billing_state === true;

  const configQuery = useQuery(
    api.referrals.getReferralConfig,
    activeBusinessId && canViewSettings
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const performanceQuery = useQuery(
    api.referrals.getBusinessReferralPerformance,
    activeBusinessId && canViewDashboard
      ? { businessId: activeBusinessId, range: '30d' }
      : 'skip'
  );
  const customersQuery = useQuery(
    api.referrals.listBusinessReferralCustomers,
    activeBusinessId && canViewCustomers
      ? { businessId: activeBusinessId, limit: 80 }
      : 'skip'
  );
  const rewardsQuery = useQuery(
    api.referrals.listBusinessReferralRewards,
    activeBusinessId && canViewCustomers
      ? { businessId: activeBusinessId, limit: 80 }
      : 'skip'
  );
  const b2bSummary = useQuery(
    api.referrals.getBusinessReferralCreditSummary,
    activeBusinessId && canViewBilling
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const saveReferralConfig = useMutation(api.referrals.saveReferralConfig);
  const getOrCreateBusinessReferralLink = useMutation(
    api.referrals.getOrCreateBusinessReferralLink
  );

  const [activeTab, setActiveTab] = useState<ReferralTab>(
    normalizeTab(params.tab)
  );
  const [isEnabled, setIsEnabled] = useState(true);
  const [rewardType, setRewardType] = useState<RewardType>('STAMP');
  const [rewardValueText, setRewardValueText] = useState('1');
  const [benefitTitle, setBenefitTitle] = useState('');
  const [benefitDescription, setBenefitDescription] = useState('');
  const [benefitExpirationDays, setBenefitExpirationDays] =
    useState<BenefitExpiration>(30);
  const [rewardRecipients, setRewardRecipients] =
    useState<RewardRecipients>('both');
  const [monthlyLimit, setMonthlyLimit] = useState<MonthlyLimit>(10);
  const [isSaving, setIsSaving] = useState(false);
  const [isB2bShareLoading, setIsB2bShareLoading] = useState(false);

  useEffect(() => {
    setActiveTab(normalizeTab(params.tab));
  }, [params.tab]);

  useEffect(() => {
    if (!configQuery) {
      return;
    }
    setIsEnabled(configQuery.isEnabled === true);
    setRewardType(configQuery.rewardType === 'BENEFIT' ? 'BENEFIT' : 'STAMP');
    setRewardValueText(
      String(Math.max(1, Number(configQuery.rewardValue ?? 1)))
    );
    setBenefitTitle(configQuery.benefitTitle ?? '');
    setBenefitDescription(configQuery.benefitDescription ?? '');
    setBenefitExpirationDays(
      configQuery.benefitExpirationDays === 14 ||
        configQuery.benefitExpirationDays === 30 ||
        configQuery.benefitExpirationDays === 60 ||
        configQuery.benefitExpirationDays === 90
        ? configQuery.benefitExpirationDays
        : 30
    );
    setRewardRecipients(configQuery.rewardRecipients ?? 'both');
    setMonthlyLimit(
      configQuery.monthlyLimit === 'unlimited' ||
        configQuery.monthlyLimit === 5 ||
        configQuery.monthlyLimit === 10 ||
        configQuery.monthlyLimit === 20 ||
        configQuery.monthlyLimit === 50
        ? configQuery.monthlyLimit
        : 10
    );
  }, [configQuery]);

  const rewardValue = useMemo(() => {
    const parsed = Number.parseInt(rewardValueText, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }
    return parsed;
  }, [rewardValueText]);

  const isPerformanceEmpty =
    performanceQuery != null &&
    performanceQuery.referralsGenerated === 0 &&
    performanceQuery.referralsJoined === 0 &&
    performanceQuery.referralsQualified === 0 &&
    performanceQuery.referralsCompleted === 0 &&
    performanceQuery.rewardsIssued === 0 &&
    performanceQuery.rewardsRedeemed === 0 &&
    performanceQuery.activeBenefits === 0 &&
    (performanceQuery.topReferrers?.length ?? 0) === 0 &&
    (performanceQuery.topOriginPrograms?.length ?? 0) === 0;

  const handleSaveConfig = async () => {
    if (!activeBusinessId || !canEditConfig || isSaving) {
      return;
    }
    try {
      setIsSaving(true);
      await saveReferralConfig({
        businessId: activeBusinessId,
        isEnabled,
        rewardType,
        rewardValue,
        benefitTitle: benefitTitle.trim() || undefined,
        benefitDescription: benefitDescription.trim() || undefined,
        benefitExpirationDays:
          rewardType === 'BENEFIT' ? benefitExpirationDays : undefined,
        rewardRecipients,
        monthlyLimit,
      });
      Alert.alert('', 'Referral settings saved');
    } catch {
      Alert.alert('Error', 'Failed to save referral settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareBusinessReferral = async (mode: 'whatsapp' | 'copy') => {
    if (!activeBusinessId || !canViewBilling || isB2bShareLoading) {
      return;
    }
    try {
      setIsB2bShareLoading(true);
      const link = await getOrCreateBusinessReferralLink({
        businessId: activeBusinessId,
      });
      const message = `Invite your business network to StampAix and earn free subscription months.\n${link.url}`;

      if (mode === 'whatsapp') {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          await Share.share({ message });
        }
      } else {
        const maybeNavigator = globalThis as {
          navigator?: {
            clipboard?: { writeText?: (value: string) => Promise<void> };
          };
        };
        if (maybeNavigator.navigator?.clipboard?.writeText) {
          await maybeNavigator.navigator.clipboard.writeText(link.url);
        } else {
          await Share.share({ message: link.url });
        }
        Alert.alert('', 'Business referral link is ready to share');
      }
    } catch {
      Alert.alert('Error', 'Failed to create business referral link');
    } finally {
      setIsB2bShareLoading(false);
    }
  };

  if (activeBusiness && !canViewSettings) {
    return <Redirect href="/(authenticated)/(business)/settings" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="Referral Settings"
            subtitle="Configuration, operations, and performance"
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        <View style={styles.tabRow}>
          {(
            ['settings', 'customers', 'rewards', 'performance'] as ReferralTab[]
          ).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabButton,
                activeTab === tab ? styles.tabButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab ? styles.tabButtonTextActive : null,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'settings' ? (
          configQuery === undefined ? (
            <View style={styles.card}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Customer Referral Config</Text>

              <View style={styles.row}>
                <Text style={styles.label}>Referrals Enabled</Text>
                <Pressable
                  onPress={() =>
                    canEditConfig && setIsEnabled((value) => !value)
                  }
                  disabled={!canEditConfig}
                  style={[
                    styles.toggle,
                    isEnabled ? styles.toggleOn : styles.toggleOff,
                  ]}
                >
                  <Text style={styles.toggleText}>
                    {isEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Reward Type</Text>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => canEditConfig && setRewardType('STAMP')}
                  style={[
                    styles.segmentButton,
                    rewardType === 'STAMP' ? styles.segmentButtonActive : null,
                  ]}
                >
                  <Text style={styles.segmentText}>STAMP</Text>
                </Pressable>
                <Pressable
                  onPress={() => canEditConfig && setRewardType('BENEFIT')}
                  style={[
                    styles.segmentButton,
                    rewardType === 'BENEFIT'
                      ? styles.segmentButtonActive
                      : null,
                  ]}
                >
                  <Text style={styles.segmentText}>BENEFIT</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Reward Value</Text>
              <TextInput
                value={rewardValueText}
                onChangeText={setRewardValueText}
                keyboardType="number-pad"
                editable={canEditConfig}
                style={styles.input}
              />

              {rewardType === 'BENEFIT' ? (
                <>
                  <Text style={styles.label}>Benefit Title</Text>
                  <TextInput
                    value={benefitTitle}
                    onChangeText={setBenefitTitle}
                    editable={canEditConfig}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Benefit Description</Text>
                  <TextInput
                    value={benefitDescription}
                    onChangeText={setBenefitDescription}
                    editable={canEditConfig}
                    multiline={true}
                    style={[styles.input, styles.multilineInput]}
                  />

                  <Text style={styles.label}>Benefit Expiration Days</Text>
                  <View style={styles.segmentRow}>
                    {BENEFIT_EXPIRATION_OPTIONS.map((value) => (
                      <Pressable
                        key={String(value)}
                        onPress={() =>
                          canEditConfig && setBenefitExpirationDays(value)
                        }
                        style={[
                          styles.segmentButtonCompact,
                          benefitExpirationDays === value
                            ? styles.segmentButtonActive
                            : null,
                        ]}
                      >
                        <Text style={styles.segmentText}>{value}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>Reward Recipients</Text>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() =>
                    canEditConfig && setRewardRecipients('referrer')
                  }
                  style={[
                    styles.segmentButtonCompact,
                    rewardRecipients === 'referrer'
                      ? styles.segmentButtonActive
                      : null,
                  ]}
                >
                  <Text style={styles.segmentText}>referrer</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    canEditConfig && setRewardRecipients('referred')
                  }
                  style={[
                    styles.segmentButtonCompact,
                    rewardRecipients === 'referred'
                      ? styles.segmentButtonActive
                      : null,
                  ]}
                >
                  <Text style={styles.segmentText}>referred</Text>
                </Pressable>
                <Pressable
                  onPress={() => canEditConfig && setRewardRecipients('both')}
                  style={[
                    styles.segmentButtonCompact,
                    rewardRecipients === 'both'
                      ? styles.segmentButtonActive
                      : null,
                  ]}
                >
                  <Text style={styles.segmentText}>both</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Monthly Referrer Limit</Text>
              <View style={styles.segmentRow}>
                {MONTHLY_LIMIT_OPTIONS.map((limit) => (
                  <Pressable
                    key={String(limit)}
                    onPress={() => canEditConfig && setMonthlyLimit(limit)}
                    style={[
                      styles.segmentButtonCompact,
                      monthlyLimit === limit
                        ? styles.segmentButtonActive
                        : null,
                    ]}
                  >
                    <Text style={styles.segmentText}>
                      {limit === 'unlimited' ? '∞' : String(limit)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => void handleSaveConfig()}
                disabled={!canEditConfig || isSaving}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.pressed : null,
                  !canEditConfig || isSaving ? styles.buttonDisabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Text>
              </Pressable>
            </View>
          )
        ) : null}

        {activeTab === 'settings' && canViewBilling ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Business Referral (B2B)</Text>
            <Text style={styles.metricLine}>
              Credited Months: {b2bSummary?.creditedMonths ?? 0}
            </Text>
            <Text style={styles.metricLine}>
              Pending Months: {b2bSummary?.pendingMonths ?? 0}
            </Text>
            <Text style={styles.metricLine}>
              Remaining Cap Months: {b2bSummary?.remainingCapMonths ?? 24}
            </Text>
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => void handleShareBusinessReferral('whatsapp')}
                disabled={isB2bShareLoading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.actionButton,
                  pressed ? styles.pressed : null,
                  isB2bShareLoading ? styles.buttonDisabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isB2bShareLoading ? 'Loading...' : 'Share WhatsApp'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleShareBusinessReferral('copy')}
                disabled={isB2bShareLoading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.actionButton,
                  pressed ? styles.pressed : null,
                  isB2bShareLoading ? styles.buttonDisabled : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Copy Link</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {activeTab === 'customers' ? (
          !canViewCustomers ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                No permission to view customers.
              </Text>
            </View>
          ) : customersQuery === undefined ? (
            <View style={styles.card}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Referred Customers</Text>
              {customersQuery.length === 0 ? (
                <Text style={styles.emptyText}>No referred customers yet.</Text>
              ) : (
                customersQuery.map((row) => (
                  <View key={String(row.referralId)} style={styles.listRow}>
                    <Text style={styles.listPrimary}>
                      {row.referredName ?? row.referredUserId}
                    </Text>
                    <Text style={styles.listSecondary}>
                      referrer: {row.referrerName ?? row.referrerUserId} ·{' '}
                      {row.status}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )
        ) : null}

        {activeTab === 'rewards' ? (
          !canViewCustomers ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                No permission to view rewards.
              </Text>
            </View>
          ) : rewardsQuery === undefined ? (
            <View style={styles.card}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Issued Referral Rewards</Text>
              {rewardsQuery.length === 0 ? (
                <Text style={styles.emptyText}>No rewards to show.</Text>
              ) : (
                rewardsQuery.map((row) => (
                  <View key={String(row.rewardId)} style={styles.listRow}>
                    <Text style={styles.listPrimary}>
                      {row.recipientName ?? row.recipientUserId}
                    </Text>
                    <Text style={styles.listSecondary}>
                      {row.actualRewardType} · {row.status}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )
        ) : null}

        {activeTab === 'performance' ? (
          !canViewDashboard ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                No permission to view performance.
              </Text>
            </View>
          ) : performanceQuery === undefined ? (
            <View style={styles.card}>
              <ActivityIndicator color="#2F6BFF" />
              <Text style={styles.emptyText}>Loading performance...</Text>
            </View>
          ) : isPerformanceEmpty ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Performance</Text>
              <Text style={styles.emptyText}>
                No referral performance data yet.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Performance</Text>
              <Text style={styles.metricLine}>
                referrals generated: {performanceQuery.referralsGenerated}
              </Text>
              <Text style={styles.metricLine}>
                referrals joined: {performanceQuery.referralsJoined}
              </Text>
              <Text style={styles.metricLine}>
                referrals qualified: {performanceQuery.referralsQualified}
              </Text>
              <Text style={styles.metricLine}>
                referrals completed: {performanceQuery.referralsCompleted}
              </Text>
              <Text style={styles.metricLine}>
                rewards issued: {performanceQuery.rewardsIssued}
              </Text>
              <Text style={styles.metricLine}>
                rewards redeemed: {performanceQuery.rewardsRedeemed}
              </Text>
              <Text style={styles.metricLine}>
                active benefits: {performanceQuery.activeBenefits}
              </Text>

              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Top Referrers</Text>
                {(performanceQuery.topReferrers ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>
                    No referrer ranking data.
                  </Text>
                ) : (
                  (performanceQuery.topReferrers ?? []).map((row) => (
                    <View
                      key={String(row.referrerUserId)}
                      style={styles.listRow}
                    >
                      <Text style={styles.listPrimary}>
                        {row.referrerName ?? row.referrerUserId}
                      </Text>
                      <Text style={styles.listSecondary}>
                        count: {row.count}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Origin Programs</Text>
                {(performanceQuery.topOriginPrograms ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>No origin program data.</Text>
                ) : (
                  (performanceQuery.topOriginPrograms ?? []).map((row) => (
                    <View
                      key={String(row.originProgramId)}
                      style={styles.listRow}
                    >
                      <Text style={styles.listPrimary}>
                        {row.programTitle ?? row.originProgramId}
                      </Text>
                      <Text style={styles.listSecondary}>
                        count: {row.count}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  content: {
    paddingHorizontal: 20,
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F6F9FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabButtonActive: {
    borderColor: '#AFC9FF',
    backgroundColor: '#EAF2FF',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  tabButtonTextActive: {
    color: '#1D4ED8',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE8FF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
  },
  toggle: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  toggleOn: {
    borderColor: '#9EDDB9',
    backgroundColor: '#EAFBF1',
  },
  toggleOff: {
    borderColor: '#F9CACA',
    backgroundColor: '#FFF1F1',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    minWidth: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F6F9FF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F6F9FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    borderColor: '#AFC9FF',
    backgroundColor: '#EAF2FF',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F8FAFF',
    minHeight: 42,
    paddingHorizontal: 12,
    textAlign: 'right',
    fontWeight: '700',
    color: '#0F172A',
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  primaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#2F6BFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DEEE',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  metricLine: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  listRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 4,
  },
  listPrimary: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  listSecondary: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
  },
  subSection: {
    marginTop: 8,
    gap: 6,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
