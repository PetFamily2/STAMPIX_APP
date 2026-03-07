import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { LockedFeatureWrapper } from '@/components/subscription/LockedFeatureWrapper';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { tw } from '@/lib/rtl';

type Segment = 'frequent' | 'stable' | 'dropoff' | 'risk';
type ReportsTopTab = 'reports' | 'customers';

const TOP_TABS: Array<{ key: ReportsTopTab; label: string }> = [
  { key: 'reports', label: '\u05d3\u05d5\u05d7\u05d5\u05ea' },
  { key: 'customers', label: '\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea' },
];

const SEGMENT_LABELS: Record<Segment, string> = {
  frequent: 'תדיר',
  stable: 'יציב',
  dropoff: 'בירידה',
  risk: 'בסיכון',
};

const SEGMENT_COLORS: Record<Segment, string> = {
  frequent: 'bg-emerald-100 text-emerald-700',
  stable: 'bg-slate-100 text-slate-700',
  dropoff: 'bg-orange-100 text-orange-700',
  risk: 'bg-rose-100 text-rose-700',
};

const DEFAULT_SUMMARY = {
  activeCustomers: 0,
  riskCount: 0,
  frequentCount: 0,
  dropoffCount: 0,
  stableCount: 0,
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

function formatLastVisit(daysSinceLastVisit: number) {
  if (daysSinceLastVisit <= 0) return 'היום';
  if (daysSinceLastVisit === 1) return 'אתמול';
  return `לפני ${daysSinceLastVisit} ימים`;
}

export default function BusinessCustomersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, tab } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    tab?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const activeTopTab: ReportsTopTab =
    tab === 'reports' ? 'reports' : 'customers';

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const [search, setSearch] = useState('');
  const canEditThresholds =
    activeBusiness?.staffRole === 'owner' || activeBusiness?.staffRole === 'manager';

  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const smartGate = gate('canUseSmartAnalytics');

  const snapshot = useQuery(
    api.events.getCustomerManagementSnapshot,
    activeBusinessId && entitlements && !smartGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const segmentationConfig = useQuery(
    api.business.getCustomerSegmentationConfig,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const updateSegmentationConfig = useMutation(
    api.business.updateCustomerSegmentationConfig
  );

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);

  const [isThresholdModalVisible, setIsThresholdModalVisible] = useState(false);
  const [riskDays, setRiskDays] = useState('');
  const [frequentVisits, setFrequentVisits] = useState('');
  const [dropPercent, setDropPercent] = useState('');
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  useEffect(() => {
    if (activeTopTab !== 'reports') {
      return;
    }
    router.replace('/(authenticated)/(business)/analytics');
  }, [activeTopTab, router]);

  useEffect(() => {
    const config = snapshot?.segmentationConfig ?? segmentationConfig;
    if (!config || isThresholdModalVisible) {
      return;
    }
    setRiskDays(String(config.riskDaysWithoutVisit));
    setFrequentVisits(String(config.frequentVisitsLast30Days));
    setDropPercent(String(config.dropPercentThreshold));
  }, [
    segmentationConfig,
    snapshot?.segmentationConfig,
    isThresholdModalVisible,
  ]);

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'unlimited' | null,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'feature_locked'
  ) => {
    setUpgradeFeatureKey(featureKey);
    setUpgradeReason(reason);
    setUpgradePlan(requiredPlan === 'unlimited' ? 'unlimited' : 'pro');
    setIsUpgradeVisible(true);
  };

  const summary = snapshot?.summary ?? DEFAULT_SUMMARY;
  const filteredCustomers = useMemo(() => {
    const customers = snapshot?.customers ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return customers;
    }

    return customers.filter((customer) => {
      const haystack = `${customer.name} ${customer.phone ?? ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [search, snapshot?.customers]);

  const placeholderRows = Array.from({ length: 4 }, (_, index) => (
    <View
      key={`placeholder-${index}`}
      className="rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] px-4 py-4"
    >
      <Text className={`text-base font-bold text-[#64748B] ${tw.textStart}`}>
        לקוח לדוגמה
      </Text>
      <Text className={`mt-1 text-xs text-[#94A3B8] ${tw.textStart}`}>--</Text>
    </View>
  ));

  const openThresholdModal = () => {
    if (!canEditThresholds || smartGate.isLocked) {
      return;
    }
    const config = snapshot?.segmentationConfig ?? segmentationConfig;
    if (config) {
      setRiskDays(String(config.riskDaysWithoutVisit));
      setFrequentVisits(String(config.frequentVisitsLast30Days));
      setDropPercent(String(config.dropPercentThreshold));
    }
    setIsThresholdModalVisible(true);
  };

  const saveThresholds = async () => {
    if (!activeBusinessId || isSavingThresholds) {
      return;
    }

    const parsedRiskDays = Number(riskDays);
    const parsedFrequentVisits = Number(frequentVisits);
    const parsedDropPercent = Number(dropPercent);

    if (
      !Number.isFinite(parsedRiskDays) ||
      !Number.isFinite(parsedFrequentVisits) ||
      !Number.isFinite(parsedDropPercent)
    ) {
      Alert.alert('שגיאה', 'יש להזין ערכים מספריים תקינים לכל הספים.');
      return;
    }

    setIsSavingThresholds(true);
    try {
      await updateSegmentationConfig({
        businessId: activeBusinessId,
        riskDaysWithoutVisit: parsedRiskDays,
        frequentVisitsLast30Days: parsedFrequentVisits,
        dropPercentThreshold: parsedDropPercent,
      });
      setIsThresholdModalVisible(false);
      Alert.alert('נשמר', 'ספי הסגמנטציה עודכנו בהצלחה.');
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'לא הצלחנו לשמור את הספים. נסו שוב.';
      Alert.alert('שגיאה', message);
    } finally {
      setIsSavingThresholds(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7FB]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <BusinessScreenHeader
          title="ניהול לקוחות"
          subtitle="סקירה על לקוחות פעילים, סיכון ותובנות AI"
          titleAccessory={
            <TouchableOpacity
              onPress={() =>
                router.replace('/(authenticated)/(business)/dashboard')
              }
              className="h-10 w-10 items-center justify-center rounded-full border border-[#E5EAF2] bg-white"
            >
              <Ionicons name="arrow-forward" size={18} color="#1A2B4A" />
            </TouchableOpacity>
          }
        />

        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {TOP_TABS.map((topTab) => {
            const isActive = activeTopTab === topTab.key;
            return (
              <TouchableOpacity
                key={topTab.key}
                onPress={() => {
                  if (topTab.key === 'reports') {
                    router.replace('/(authenticated)/(business)/analytics');
                    return;
                  }
                  router.replace({
                    pathname: '/(authenticated)/(business)/customers',
                    params: { tab: 'customers' },
                  });
                }}
                className={`flex-1 rounded-full py-2.5 ${
                  isActive ? 'bg-[#2F6BFF]' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-center text-sm font-extrabold ${
                    isActive ? 'text-white' : 'text-[#51617F]'
                  }`}
                >
                  {topTab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>


        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={smartGate.isLocked}
            requiredPlan={smartGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canUseSmartAnalytics',
                smartGate.requiredPlan,
                smartGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="Smart Analytics נעול"
            subtitle="סקירת לקוחות מלאה זמינה במסלול Pro ומעלה."
            benefits={[
              'זיהוי לקוחות בסיכון ובירידה בתדירות',
              'תובנות AI לשימור לקוחות',
              'סגמנטציה חכמה לפי התנהגות',
            ]}
          >
            <View className="rounded-3xl border border-[#E5EAF2] bg-white p-5">
              <View className={`${tw.flexRow} flex-wrap gap-3`}>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3">
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    לקוחות פעילים
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#0F294B]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(summary.activeCustomers)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#FFF6F6] p-3">
                  <Text className="text-right text-xs font-semibold text-[#B45353]">
                    לקוחות בסיכון
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#B42318]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(summary.riskCount)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#F0FDF4] p-3">
                  <Text className="text-right text-xs font-semibold text-[#2F6B4B]">
                    לקוחות תדירים
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#166534]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(summary.frequentCount)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#FFF7ED] p-3">
                  <Text className="text-right text-xs font-semibold text-[#B45309]">
                    לקוחות בירידה
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#C2410C]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(summary.dropoffCount)}
                  </Text>
                </View>
              </View>
            </View>
          </LockedFeatureWrapper>
        </View>

        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={smartGate.isLocked}
            requiredPlan={smartGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canUseSmartAnalytics',
                smartGate.requiredPlan,
                smartGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="תובנות AI נעולות"
            subtitle="תובנות לקוחות זמינות במסלול Pro ומעלה."
          >
            <View className="rounded-3xl border border-[#E5EAF2] bg-[#182F4E] px-5 py-5">
              <View className={`${tw.flexRow} items-start gap-3`}>
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-[#2F6BFF]/20">
                  <Ionicons name="sparkles" size={18} color="#7EB1FF" />
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-lg font-black text-[#7EB1FF]">
                    תובנות AI
                  </Text>
                  {smartGate.isLocked ? (
                    <Text
                      className={`mt-2 text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                    >
                      שדרגו למסלול Pro כדי לראות תובנות חכמות בזמן אמת.
                    </Text>
                  ) : snapshot === undefined ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      style={{ marginTop: 12 }}
                    />
                  ) : snapshot.insights.length === 0 ? (
                    <Text
                      className={`mt-2 text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                    >
                      אין כרגע תובנות להצגה.
                    </Text>
                  ) : (
                    <View className="mt-2 gap-2">
                      {snapshot.insights.map((insight) => (
                        <Text
                          key={insight}
                          className={`text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                        >
                          - {insight}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </LockedFeatureWrapper>
        </View>

        <View className="mt-5 rounded-full border border-[#E5EAF2] bg-white px-4 py-3">
          <View className={`${tw.flexRow} items-center gap-2`}>
            <Ionicons name="search-outline" size={20} color="#B0BAC8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="חפש לקוח לפי שם או טלפון"
              placeholderTextColor="#B0BAC8"
              className={`flex-1 text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
            />
          </View>
        </View>

        <View className={`${tw.flexRow} mt-4 items-center justify-between`}>
          <View className={`${tw.flexRow} items-center gap-2`}>
            <TouchableOpacity
              onPress={openThresholdModal}
              disabled={!canEditThresholds || smartGate.isLocked}
              className={`rounded-full px-4 py-2 ${
                !canEditThresholds || smartGate.isLocked
                  ? 'bg-[#E2E8F0]'
                  : 'bg-[#2F6BFF]'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  !canEditThresholds || smartGate.isLocked
                    ? 'text-[#64748B]'
                    : 'text-white'
                }`}
              >
                התאמת ספים
              </Text>
            </TouchableOpacity>
            {!canEditThresholds ? (
              <Text className="text-xs text-[#94A3B8]">לצפייה בלבד</Text>
            ) : null}
          </View>

          <Text className="text-xs font-semibold text-[#64748B]">
            {smartGate.isLocked
              ? 'נתוני לקוחות נעולים במסלול הנוכחי'
              : `${formatNumber(filteredCustomers.length)} לקוחות`}
          </Text>
        </View>

        <View className="mt-3 gap-3">
          {smartGate.isLocked ? (
            placeholderRows
          ) : snapshot === undefined ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : filteredCustomers.length === 0 ? (
            <View className="rounded-2xl border border-[#E5EAF2] bg-white p-4">
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                לא נמצאו לקוחות שתואמים לחיפוש.
              </Text>
            </View>
          ) : (
            filteredCustomers.map((customer) => {
              const segment = customer.segment as Segment;
              return (
                <View
                  key={customer.membershipId}
                  className="rounded-2xl border border-[#E5EAF2] bg-white px-4 py-4"
                >
                  <View className={`${tw.flexRow} items-start justify-between`}>
                    <View className="items-end">
                      <Text
                        className={`text-xs text-[#94A3B8] ${tw.textStart}`}
                      >
                        ביקור אחרון
                      </Text>
                      <Text
                        className={`mt-1 text-sm font-black text-[#0F172A] ${tw.textStart}`}
                      >
                        {formatLastVisit(customer.daysSinceLastVisit)}
                      </Text>
                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        30 ימים: {customer.visitsLast30} | 30 קודמים:{' '}
                        {customer.visitsPrev30}
                      </Text>
                    </View>

                    <View className="flex-1 items-end px-3">
                      <Text
                        className={`text-lg font-black text-[#0F294B] ${tw.textStart}`}
                      >
                        {customer.name}
                      </Text>
                      <Text
                        className={`mt-1 text-xs text-[#8A97AC] ${tw.textStart}`}
                      >
                        {customer.phone ?? 'ללא טלפון'}
                      </Text>
                      <View className={`${tw.flexRow} mt-2 items-center gap-2`}>
                        <View
                          className={`rounded-full px-3 py-1 ${SEGMENT_COLORS[segment]}`}
                        >
                          <Text className="text-xs font-bold">
                            {SEGMENT_LABELS[segment]}
                          </Text>
                        </View>
                        {customer.isVip ? (
                          <View className="rounded-full bg-indigo-100 px-3 py-1">
                            <Text className="text-xs font-bold text-indigo-700">
                              VIP
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#ECF1FF]">
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color="#2F6BFF"
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={activeBusinessId}
        initialPlan={upgradePlan}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
      />

      <Modal
        visible={isThresholdModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsThresholdModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setIsThresholdModalVisible(false)}
          />
          <View className="rounded-t-3xl bg-white px-5 pb-6 pt-4">
            <View className="h-1.5 w-12 self-center rounded-full bg-[#CBD5E1]" />
            <Text
              className={`mt-4 text-xl font-black text-[#0F172A] ${tw.textStart}`}
            >
              התאמת ספי סגמנטציה
            </Text>
            <Text className={`mt-1 text-sm text-[#64748B] ${tw.textStart}`}>
              ערכים מומלצים ניתנים לעריכה על ידי בעלים או מנהל.
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text
                  className={`mb-1 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  סף סיכון (ימים ללא ביקור)
                </Text>
                <TextInput
                  value={riskDays}
                  onChangeText={setRiskDays}
                  keyboardType="number-pad"
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>

              <View>
                <Text
                  className={`mb-1 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  סף לקוח תדיר (ביקורים ב-30 יום)
                </Text>
                <TextInput
                  value={frequentVisits}
                  onChangeText={setFrequentVisits}
                  keyboardType="number-pad"
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>

              <View>
                <Text
                  className={`mb-1 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  אחוז ירידה ל-Dropoff
                </Text>
                <TextInput
                  value={dropPercent}
                  onChangeText={setDropPercent}
                  keyboardType="number-pad"
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>
            </View>

            <View className={`${tw.flexRow} mt-5 gap-2`}>
              <TouchableOpacity
                onPress={() => setIsThresholdModalVisible(false)}
                className="flex-1 rounded-2xl border border-[#CBD5E1] py-3"
              >
                <Text className="text-center text-sm font-bold text-[#64748B]">
                  ביטול
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void saveThresholds();
                }}
                disabled={isSavingThresholds}
                className={`flex-1 rounded-2xl py-3 ${
                  isSavingThresholds ? 'bg-[#93C5FD]' : 'bg-[#2563EB]'
                }`}
              >
                {isSavingThresholds ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    שמירה
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
