import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
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
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { IS_RTL, tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

const TEXT_START = IS_RTL ? 'right' : 'left';
const TEXT_END = IS_RTL ? 'left' : 'right';
const ROW_DIRECTION = IS_RTL ? 'row-reverse' : 'row';
type MarketingTopTab = 'campaigns' | 'loyalty';
const TOP_TABS: Array<{ key: MarketingTopTab; label: string }> = [
  { key: 'campaigns', label: 'קמפיינים' },
  { key: 'loyalty', label: 'כרטיסיות נאמנות' },
];
const TEXT = {
  savedTitle: '\u05E0\u05E9\u05DE\u05E8',
  savedMessage:
    '\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05E0\u05D5\u05E6\u05E8\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4.',
  upgradeRequired: '\u05E9\u05D3\u05E8\u05D5\u05D2 \u05E0\u05D3\u05E8\u05E9',
  errorTitle: '\u05E9\u05D2\u05D9\u05D0\u05D4',
  createFailed:
    '\u05D9\u05E6\u05D9\u05E8\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D4 \u05E0\u05DB\u05E9\u05DC\u05D4.',
  businessFallback: '\u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA',
  screenTitle:
    '\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D5\u05EA \u05E0\u05D0\u05DE\u05E0\u05D5\u05EA',
  screenSubtitle:
    '\u05E0\u05D9\u05D4\u05D5\u05DC \u05EA\u05D5\u05DB\u05E0\u05D9\u05D5\u05EA \u05E0\u05D0\u05DE\u05E0\u05D5\u05EA \u05DC\u05E2\u05E1\u05E7 \u05D1\u05E6\u05D5\u05E8\u05D4 \u05E4\u05E9\u05D5\u05D8\u05D4 \u05D5\u05D1\u05E8\u05D5\u05E8\u05D4',
  createNewCard:
    '\u05E6\u05D5\u05E8 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D4',
  createSectionTitle:
    '\u05D9\u05E6\u05D9\u05E8\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D4 \u05D7\u05D3\u05E9\u05D4',
  placeholderCardName:
    '\u05E9\u05DD \u05D4\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D4',
  placeholderReward: '\u05D4\u05D8\u05D1\u05D4',
  placeholderStamps: '\u05E0\u05D9\u05E7\u05D5\u05D1\u05D9\u05DD',
  placeholderIcon: '\u05D0\u05D9\u05D9\u05E7\u05D5\u05DF',
  createCardButton:
    '\u05E6\u05D5\u05E8 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D4',
  usageTitle:
    '\u05E9\u05D9\u05DE\u05D5\u05E9 \u05D1\u05DE\u05E1\u05DC\u05D5\u05DC',
  cardsLabel: '\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05DD',
  inUseLabel: '\u05D1\u05E9\u05D9\u05DE\u05D5\u05E9',
  customersLabel: '\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA',
  activeLabel: '\u05E4\u05E2\u05D9\u05DC\u05D9\u05DD',
  redemptionsLabel: '\u05DE\u05D9\u05DE\u05D5\u05E9\u05D9\u05DD',
  days30Label: '30 \u05D9\u05D5\u05DD',
  limitReached:
    '\u05D4\u05D2\u05E2\u05EA\u05DD \u05DC\u05DE\u05D2\u05D1\u05DC\u05EA \u05D4\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D5\u05EA \u05D1\u05DE\u05E1\u05DC\u05D5\u05DC \u05D4\u05E0\u05D5\u05DB\u05D7\u05D9.',
  nearLimit:
    '\u05D0\u05EA\u05DD \u05DE\u05EA\u05E7\u05E8\u05D1\u05D9\u05DD \u05DC\u05DE\u05D2\u05D1\u05DC\u05EA \u05D4\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05D5\u05EA \u05D1\u05DE\u05E1\u05DC\u05D5\u05DC \u05D4\u05E0\u05D5\u05DB\u05D7\u05D9.',
  upgradePlan: '\u05E9\u05D3\u05E8\u05D5\u05D2 \u05DE\u05E1\u05DC\u05D5\u05DC',
  activeCardsTitle:
    '\u05DB\u05E8\u05D8\u05D9\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA',
  noCardsYet:
    '\u05E2\u05D3\u05D9\u05D9\u05DF \u05DC\u05D0 \u05D9\u05E6\u05E8\u05EA\u05DD \u05DB\u05E8\u05D8\u05D9\u05D5\u05EA \u05E0\u05D0\u05DE\u05E0\u05D5\u05EA.',
  noActiveCards:
    '\u05D0\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2 \u05DB\u05E8\u05D8\u05D9\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA.',
  archivedCardsTitle:
    '\u05DB\u05E8\u05D8\u05D9\u05D5\u05EA \u05D1\u05D0\u05E8\u05DB\u05D9\u05D5\u05DF',
  noArchivedCards:
    '\u05D0\u05D9\u05DF \u05DB\u05E8\u05D8\u05D9\u05D5\u05EA \u05D1\u05D0\u05E8\u05DB\u05D9\u05D5\u05DF.',
} as const;

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

function formatLastActivityShort(value: number | null) {
  if (!value) {
    return '\u05DC\u05DC\u05D0';
  }
  return new Date(value).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
  });
}

function ProgramPerformanceTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.performanceTile}>
      <Text style={styles.performanceLabel}>{label}</Text>
      <Text style={styles.performanceValue}>{value}</Text>
    </View>
  );
}

function PlanUsageTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <View style={styles.usageChip}>
      <Text style={styles.usageChipLabel}>{label}</Text>
      <Text style={styles.usageChipValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.usageChipHint} numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
}

export default function BusinessCardsManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, section } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    section?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const activeSection = section === 'loyalty' ? 'loyalty' : 'campaigns';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  if (activeSection === 'campaigns') {
    return (
      <Redirect
        href={{
          pathname: '/(authenticated)/(business)/cards/campaigns',
          params: {
            preview,
            map,
          },
        }}
      />
    );
  }

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const canManage =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';

  const { entitlements, limitStatus } = useEntitlements(activeBusinessId);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];

  const createLoyaltyProgram = useMutation(
    api.loyaltyPrograms.createLoyaltyProgram
  );

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [stampIcon, setStampIcon] = useState('star');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);

  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
    [programs]
  );
  const archivedPrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'archived'),
    [programs]
  );

  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const requiredPlanForCards =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCards ?? 'pro';

  const openUpgradeForCards = () => {
    openSubscriptionComparison(router, {
      featureKey: 'maxCards',
      requiredPlan: requiredPlanForCards,
      reason: 'limit_reached',
    });
  };

  const parsedMaxStamps = Number(maxStamps);
  const canCreate =
    Boolean(activeBusinessId) &&
    canManage &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    stampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    !isCreating;

  const handleCreate = async () => {
    if (!activeBusinessId || !canCreate) {
      return;
    }
    if (cardLimit.isAtLimit) {
      openUpgradeForCards();
      return;
    }

    setIsCreating(true);
    try {
      await createLoyaltyProgram({
        businessId: activeBusinessId,
        title: title.trim(),
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        stampIcon: stampIcon.trim(),
      });
      setTitle('');
      setRewardName('');
      setMaxStamps('10');
      setStampIcon('star');
      setIsCreatePanelOpen(false);
      Alert.alert(TEXT.savedTitle, TEXT.savedMessage);
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          TEXT.upgradeRequired,
          entitlementErrorToHebrewMessage(entitlementError)
        );
        openSubscriptionComparison(router, {
          featureKey: entitlementError.limitKey ?? 'maxCards',
          requiredPlan: entitlementError.requiredPlan ?? requiredPlanForCards,
          reason:
            entitlementError.code === 'PLAN_LIMIT_REACHED'
              ? 'limit_reached'
              : entitlementError.code === 'SUBSCRIPTION_INACTIVE'
                ? 'subscription_inactive'
                : 'feature_locked',
        });
        return;
      }
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.createFailed
      );
    } finally {
      setIsCreating(false);
    }
  };

  const totalCustomers = activePrograms.reduce(
    (sum, program) => sum + program.metrics.activeMembers,
    0
  );
  const totalRedemptions30d = activePrograms.reduce(
    (sum, program) => sum + program.metrics.redemptions30d,
    0
  );
  const businessDisplayName =
    activeBusiness?.name?.trim() || TEXT.businessFallback;
  const canOpenCreatePanel = canManage && !isCreating;

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <BusinessScreenHeader
          title={TEXT.screenTitle}
          subtitle={TEXT.screenSubtitle}
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
            const isActive = topTab.key === 'loyalty';
            return (
              <TouchableOpacity
                key={topTab.key}
                onPress={() => {
                  if (topTab.key === 'loyalty') {
                    return;
                  }
                  router.replace('/(authenticated)/(business)/cards/campaigns');
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

        <TouchableOpacity
          disabled={!canOpenCreatePanel && !cardLimit.isAtLimit}
          onPress={() => {
            if (cardLimit.isAtLimit) {
              openUpgradeForCards();
              return;
            }
            if (!canOpenCreatePanel) {
              return;
            }
            setIsCreatePanelOpen((current) => !current);
          }}
          className={`mt-4 rounded-3xl px-4 py-4 ${
            !canOpenCreatePanel && !cardLimit.isAtLimit
              ? 'bg-[#CBD5E1]'
              : 'bg-[#2F6BFF]'
          }`}
        >
          <View className={`${tw.flexRow} items-center justify-center gap-2`}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text className="text-sm font-black text-white">
              {TEXT.createNewCard}
            </Text>
          </View>
        </TouchableOpacity>

        {isCreatePanelOpen ? (
          <View className="mt-3 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              {TEXT.createSectionTitle}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={canManage}
              placeholder={TEXT.placeholderCardName}
              placeholderTextColor="#94A3B8"
              className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
            />
            <TextInput
              value={rewardName}
              onChangeText={setRewardName}
              editable={canManage}
              placeholder={TEXT.placeholderReward}
              placeholderTextColor="#94A3B8"
              className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
            />
            <View className={`${tw.flexRow} gap-2`}>
              <TextInput
                value={maxStamps}
                onChangeText={setMaxStamps}
                editable={canManage}
                keyboardType="number-pad"
                placeholder={TEXT.placeholderStamps}
                placeholderTextColor="#94A3B8"
                className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              <TextInput
                value={stampIcon}
                onChangeText={setStampIcon}
                editable={canManage}
                placeholder={TEXT.placeholderIcon}
                placeholderTextColor="#94A3B8"
                className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
            </View>
            <TouchableOpacity
              disabled={!canCreate}
              onPress={() => {
                void handleCreate();
              }}
              className={`rounded-2xl px-4 py-3 ${
                canCreate ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
              }`}
            >
              {isCreating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-sm font-bold text-white">
                  {TEXT.createCardButton}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            {TEXT.usageTitle}
          </Text>
          <View style={styles.usageStrip}>
            <PlanUsageTile
              label={TEXT.cardsLabel}
              value={`${activePrograms.length}/${cardLimit.limitValue}`}
              hint={TEXT.inUseLabel}
            />
            <PlanUsageTile
              label={TEXT.customersLabel}
              value={formatNumber(totalCustomers)}
              hint={TEXT.activeLabel}
            />
            <PlanUsageTile
              label={TEXT.redemptionsLabel}
              value={formatNumber(totalRedemptions30d)}
              hint={TEXT.days30Label}
            />
          </View>

          {cardLimit.isNearLimit || cardLimit.isAtLimit ? (
            <View className="mt-4 rounded-2xl border border-[#F59E0B] bg-[#FFF7ED] p-3">
              <Text
                className={`text-xs font-bold text-[#B45309] ${tw.textStart}`}
              >
                {cardLimit.isAtLimit ? TEXT.limitReached : TEXT.nearLimit}
              </Text>
              <TouchableOpacity
                onPress={openUpgradeForCards}
                className="mt-2 self-start rounded-xl bg-[#1D4ED8] px-3 py-2"
              >
                <Text className="text-xs font-bold text-white">
                  {TEXT.upgradePlan}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            {TEXT.activeCardsTitle} ({activePrograms.length})
          </Text>
          {activeBusinessId && programs.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              {TEXT.noCardsYet}
            </Text>
          ) : activePrograms.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              {TEXT.noActiveCards}
            </Text>
          ) : (
            activePrograms.map((program) => (
              <View
                key={program.loyaltyProgramId}
                className="rounded-[28px] border border-[#DCE7FF] bg-[#F8FBFF] p-3 gap-3"
              >
                <ProgramCustomerCardPreview
                  businessName={businessDisplayName}
                  businessLogoUrl={activeBusiness?.logoUrl ?? null}
                  title={program.title}
                  rewardName={program.rewardName}
                  maxStamps={program.maxStamps}
                  cardThemeId={program.cardThemeId}
                  variant="list"
                />

                <View style={styles.performanceHeaderRow}>
                  <Text style={styles.performanceHeaderLabel}>
                    {
                      '\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9 \u05D4\u05DB\u05E8\u05D8\u05D9\u05D4'
                    }
                  </Text>
                  <Text style={styles.performanceHeaderTitle} numberOfLines={1}>
                    {program.title}
                  </Text>
                </View>

                <View style={styles.performanceGrid}>
                  <ProgramPerformanceTile
                    label={
                      '\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D9\u05DD'
                    }
                    value={formatNumber(program.metrics.activeMembers)}
                  />
                  <ProgramPerformanceTile
                    label={
                      '\u05E1\u05D4\u05DB \u05DE\u05E6\u05D8\u05E8\u05E4\u05D9\u05DD'
                    }
                    value={formatNumber(program.metrics.totalMembers)}
                  />
                  <ProgramPerformanceTile
                    label={
                      '\u05E0\u05D9\u05E7\u05D5\u05D1\u05D9\u05DD 7 \u05D9\u05DE\u05D9\u05DD'
                    }
                    value={formatNumber(program.metrics.stamps7d)}
                  />
                  <ProgramPerformanceTile
                    label={
                      '\u05DE\u05D9\u05DE\u05D5\u05E9\u05D9\u05DD 30 \u05D9\u05D5\u05DD'
                    }
                    value={formatNumber(program.metrics.redemptions30d)}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            {TEXT.archivedCardsTitle} ({archivedPrograms.length})
          </Text>
          {archivedPrograms.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              {TEXT.noArchivedCards}
            </Text>
          ) : (
            archivedPrograms.map((program) => (
              <View
                key={program.loyaltyProgramId}
                className="rounded-[28px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 gap-3"
              >
                <ProgramCustomerCardPreview
                  businessName={businessDisplayName}
                  businessLogoUrl={activeBusiness?.logoUrl ?? null}
                  title={program.title}
                  rewardName={program.rewardName}
                  maxStamps={program.maxStamps}
                  previewCurrentStamps={0}
                  cardThemeId={program.cardThemeId}
                  status="archived"
                  variant="list"
                />
                <View style={styles.performanceHeaderRow}>
                  <Text style={styles.performanceHeaderLabel}>
                    {
                      '\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9 \u05D4\u05DB\u05E8\u05D8\u05D9\u05D4'
                    }
                  </Text>
                  <Text style={styles.performanceHeaderTitle} numberOfLines={1}>
                    {program.title}
                  </Text>
                </View>

                <View style={styles.performanceGrid}>
                  <ProgramPerformanceTile
                    label={
                      '\u05E1\u05D4\u05DB \u05DE\u05E6\u05D8\u05E8\u05E4\u05D9\u05DD'
                    }
                    value={formatNumber(program.metrics.totalMembers)}
                  />
                  <ProgramPerformanceTile
                    label={
                      '\u05E0\u05D9\u05E7\u05D5\u05D1\u05D9\u05DD 7 \u05D9\u05DE\u05D9\u05DD'
                    }
                    value={formatNumber(program.metrics.stamps7d)}
                  />
                  <ProgramPerformanceTile
                    label={
                      '\u05DE\u05D9\u05DE\u05D5\u05E9\u05D9\u05DD 30 \u05D9\u05D5\u05DD'
                    }
                    value={formatNumber(program.metrics.redemptions30d)}
                  />
                  <ProgramPerformanceTile
                    label={
                      '\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D4'
                    }
                    value={formatLastActivityShort(
                      program.metrics.lastActivityAt
                    )}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  usageStrip: {
    marginTop: 12,
    flexDirection: ROW_DIRECTION,
    gap: 8,
  },
  usageChip: {
    flex: 1,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE7F8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: IS_RTL ? 'flex-end' : 'flex-start',
    justifyContent: 'center',
    gap: 2,
  },
  usageChipLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  usageChipValue: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
  usageChipHint: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textAlign: TEXT_END,
  },
  performanceHeaderRow: {
    marginTop: 2,
    paddingTop: 4,
    flexDirection: ROW_DIRECTION,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  performanceHeaderLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  performanceHeaderTitle: {
    flex: 1,
    marginStart: 8,
    color: '#1A2B4A',
    fontSize: 13,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
  performanceGrid: {
    flexDirection: ROW_DIRECTION,
    flexWrap: 'wrap',
    gap: 8,
  },
  performanceTile: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'space-between',
    alignItems: IS_RTL ? 'flex-end' : 'flex-start',
    gap: 4,
  },
  performanceLabel: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  performanceValue: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
});
