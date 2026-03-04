import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import BrandPageHeader from '@/components/BrandPageHeader';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { LockedFeatureWrapper } from '@/components/subscription/LockedFeatureWrapper';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import {
  Card,
  ListRow,
  PrimaryButton,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

const BUSINESS_PLAN_LABELS: Record<'starter' | 'pro' | 'unlimited', string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  unlimited: 'Unlimited AI',
};

type Activity = {
  id: string;
  customer: string;
  type: 'punch' | 'reward';
  time: string;
};

type QuickShortcutTile = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
  fullWidth?: boolean;
};

const ACTION_CARDS = [
  {
    id: 'card-settings',
    title: '׳”׳’׳“׳¨׳•׳× ׳›׳¨׳˜׳™׳¡ ׳•׳”׳˜׳‘׳•׳×',
    subtitle: '׳¢׳¨׳•׳ ׳₪׳¨׳¡׳™׳, ׳ ׳™׳§׳•׳‘׳™׳ ׳•׳׳™׳×׳•׳’',
    icon: 'נ“',
  },
  {
    id: 'team',
    title: '׳ ׳™׳”׳•׳ ׳¦׳•׳•׳× ׳¢׳•׳‘׳“׳™׳',
    subtitle: '׳”׳¨׳©׳׳•׳×, ׳׳©׳׳¨׳•׳× ׳•׳ ׳™׳˜׳•׳¨ ׳₪׳¢׳™׳׳•׳×',
    icon: 'נ›¡ן¸',
  },
];

const QUICK_SHORTCUT_TILES: QuickShortcutTile[] = [
  {
    id: 'business-analytics',
    title: '׳“׳•׳—׳•׳× ׳¢׳¡׳§',
    subtitle: 'Business analytics',
    icon: 'bar-chart-outline',
    route: '/(authenticated)/(business)/analytics',
  },
  {
    id: 'store-settings',
    title: '׳”׳’׳“׳¨׳•׳× ׳—׳ ׳•׳×',
    subtitle: '׳₪׳¨׳˜׳™ ׳¢׳¡׳§ ׳•׳”׳¢׳“׳₪׳•׳×',
    icon: 'storefront-outline',
    route: '/merchant/store-settings',
  },
  {
    id: 'profile-settings',
    title: '׳”׳’׳“׳¨׳•׳× ׳₪׳¨׳•׳₪׳™׳',
    subtitle: '׳—׳©׳‘׳•׳ ׳•׳”׳¨׳©׳׳•׳×',
    icon: 'person-circle-outline',
    route: '/merchant/profile-settings',
  },
  {
    id: 'staff-qr',
    title: 'QR ׳׳¢׳•׳‘׳“׳™׳',
    subtitle: '׳¡׳¨׳™׳§׳× ׳¦׳•׳•׳×',
    icon: 'qr-code-outline',
    route: '/(authenticated)/(business)/qr',
    fullWidth: true,
  },
];

const ACTIVITY_FEED: Activity[] = [
  { id: '1', customer: '׳™׳©׳¨׳׳ ׳™׳©׳¨׳׳׳™', type: 'punch', time: '10:42' },
  { id: '2', customer: '׳׳™׳›׳ ׳׳•׳™', type: 'reward', time: '09:15' },
  { id: '3', customer: '׳“׳ ׳™ ׳›׳”׳', type: 'punch', time: '08:50' },
];

export default function MerchantDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const selectedBiz = businesses.find(
    (b) => b.businessId === selectedBusinessId
  );
  const isOwner = selectedBiz?.staffRole === 'owner';
  const { entitlements, gate, limitStatus } = useEntitlements(selectedBusinessId);
  const teamGate = gate('canManageTeam');
  const marketingGate = gate('canUseMarketingHubAI');
  const aiCampaignLimit = limitStatus('maxAiCampaignsPerMonth');
  const aiCampaignsData = useQuery(
    api.campaigns.listAiCampaignsByBusiness,
    selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
  );
  const createAiCampaign = useMutation(api.campaigns.createAiCampaign);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | undefined>(
    undefined
  );
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
  const [isCreatingAiCampaign, setIsCreatingAiCampaign] = useState(false);

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'unlimited' | null,
    reason: 'feature_locked' | 'limit_reached' | 'subscription_inactive' = 'feature_locked'
  ) => {
    setUpgradeFeatureKey(featureKey);
    setUpgradeReason(reason);
    setUpgradePlan(requiredPlan === 'unlimited' ? 'unlimited' : 'pro');
    setIsUpgradeVisible(true);
  };

  useEffect(() => {
    setSelectedBusinessId((current) => {
      const list = businesses ?? [];
      if (!list.length) {
        return null;
      }
      if (current && list.some((business) => business.businessId === current)) {
        return current;
      }
      return list[0].businessId;
    });
  }, [businesses]);

  useEffect(() => {
    if (isPreviewMode) {
      return;
    }
    if (isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const analyticsArgs = selectedBusinessId
    ? { businessId: selectedBusinessId }
    : 'skip';
  const analytics = useQuery(api.analytics.getBusinessActivity, analyticsArgs);
  const today = analytics?.daily?.at(-1);
  const weeklyUnique = analytics?.totals?.uniqueCustomers ?? 0;
  const weeklyRedemptions = analytics?.totals?.redemptions ?? 0;
  const isAnalyticsLoading = !!selectedBusinessId && analytics === undefined;

  const kpiCards = [
    {
      id: 'punches',
      label: '׳ ׳™׳§׳•׳‘׳™׳ ׳”׳™׳•׳',
      value: formatNumber(today?.stamps ?? 0),
      accent: 'bg-blue-50',
      icon: 'ג”ן¸',
    },
    {
      id: 'new-customers',
      label: '׳׳§׳•׳—׳•׳× ׳₪׳¢׳™׳׳™׳ ׳”׳©׳‘׳•׳¢',
      value: formatNumber(weeklyUnique),
      accent: 'bg-emerald-50',
      icon: 'ג•',
    },
    {
      id: 'redemptions',
      label: '׳”׳˜׳‘׳•׳× ׳”׳©׳‘׳•׳¢',
      value: formatNumber(weeklyRedemptions),
      accent: 'bg-orange-50',
      icon: 'נ',
    },
  ];

  const aiUsageUsed =
    aiCampaignsData?.usage?.used ?? entitlements?.usage.aiCampaignsUsedThisMonth ?? 0;
  const aiUsageLimit =
    aiCampaignsData?.usage?.limit ?? entitlements?.limits.maxAiCampaignsPerMonth ?? 0;
  const aiUsageLabel =
    aiUsageLimit === -1 ? `${aiUsageUsed}/׳׳׳ ׳”׳’׳‘׳׳”` : `${aiUsageUsed}/${aiUsageLimit}`;

  const handleUpgradeFromBanner = () => {
    openUpgrade('canUseMarketingHubAI', 'pro', 'feature_locked');
  };

  const handleCreateAiCampaign = async () => {
    if (!selectedBusinessId || isCreatingAiCampaign) {
      return;
    }

    if (marketingGate.isLocked) {
      openUpgrade(
        'canUseMarketingHubAI',
        marketingGate.requiredPlan,
        marketingGate.reason === 'subscription_inactive'
          ? 'subscription_inactive'
          : 'feature_locked'
      );
      return;
    }

    setIsCreatingAiCampaign(true);
    try {
      await createAiCampaign({
        businessId: selectedBusinessId,
        title: '׳§׳׳₪׳™׳™׳ AI ׳—׳“׳©',
        prompt: '׳”׳¦׳™׳¢׳• ׳׳‘׳¦׳¢ ׳”׳—׳–׳¨׳” ׳׳׳§׳•׳—׳•׳× ׳©׳׳ ׳‘׳™׳§׳¨׳• ׳‘׳©׳‘׳•׳¢ ׳”׳׳—׳¨׳•׳.',
      });
      Alert.alert('׳‘׳•׳¦׳¢', '׳˜׳™׳•׳˜׳× ׳§׳׳₪׳™׳™׳ AI ׳ ׳•׳¦׳¨׳” ׳‘׳”׳¦׳׳—׳”.');
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        openUpgrade(
          entitlementError.featureKey ?? 'canUseMarketingHubAI',
          entitlementError.requiredPlan ?? 'pro',
          entitlementError.code === 'PLAN_LIMIT_REACHED'
            ? 'limit_reached'
            : entitlementError.code === 'SUBSCRIPTION_INACTIVE'
              ? 'subscription_inactive'
              : 'feature_locked'
        );
        Alert.alert('׳©׳“׳¨׳•׳’ ׳ ׳“׳¨׳©', entitlementErrorToHebrewMessage(entitlementError));
      } else {
        Alert.alert('׳©׳’׳™׳׳”', '׳׳ ׳”׳¦׳׳—׳ ׳• ׳׳™׳¦׳•׳¨ ׳§׳׳₪׳™׳™׳ AI. ׳ ׳¡׳• ׳©׳•׳‘.');
      }
    } finally {
      setIsCreatingAiCampaign(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 32,
        }}
        className="flex-1"
      >
        <View className="pb-2">
          <BusinessScreenHeader
            title={'\u05de\u05e8\u05db\u05d6 \u05e0\u05d9\u05d4\u05d5\u05dc'}
            subtitle={
              '\u05ea\u05de\u05d5\u05e0\u05ea \u05de\u05e6\u05d1 \u05de\u05d4\u05d9\u05e8\u05d4 \u05e9\u05dc \u05d4\u05e4\u05e2\u05d9\u05dc\u05d5\u05ea \u05d1\u05e2\u05e1\u05e7'
            }
          />
        </View>
        <View className="hidden">
          <BrandPageHeader
            title="׳׳¨׳›׳– ׳ ׳™׳”׳•׳"
            subtitle="׳×׳׳•׳ ׳× ׳׳¦׳‘ ׳׳”׳™׳¨׳” ׳©׳ ׳”׳₪׳¢׳™׳׳•׳× ׳‘׳¢׳¡׳§"
          />
        </View>
        <View className="hidden px-5 pb-4 pt-2">
          <View className={`${tw.flexRow} items-center justify-between`}>
            <View className={`${tw.flexRow} items-center gap-3`}>
              <View className="h-12 w-12 rounded-full bg-[#D4EDFF]" />
              <Text
                className={`text-[24px] font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                ׳©׳׳•׳, ׳§׳₪׳” ׳׳¨׳•׳׳” נ‘‹
              </Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Text className="text-2xl text-[#2F6BFF]">נ‘₪</Text>
            </View>
          </View>
          <Text className={`mt-1 text-sm text-[#2F6BFF] ${tw.textStart}`}>
            ׳›׳׳ ׳¡׳§׳™׳¨׳” ׳׳”׳™׳¨׳” ׳©׳ ׳”׳₪׳¢׳™׳׳•׳× ׳”׳™׳•׳׳™׳× ׳‘׳¢׳¡׳§
          </Text>
        </View>

        <View className="mt-3">
          <Card className="rounded-[26px] border border-[#A9C7FF] bg-[#EEF3FF] p-5">
            <View
              className={`${tw.flexRow} items-center justify-between gap-4`}
            >
              <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white">
                <Text className="text-base font-black text-[#2F6BFF]">
                  {entitlements?.plan
                    ? BUSINESS_PLAN_LABELS[entitlements.plan]
                    : 'Starter'}
                </Text>
              </View>
              <View className="flex-1 items-end">
                <Text
                  className={`text-lg font-extrabold text-[#1A2B4A] ${tw.textStart}`}
                >
                  ׳©׳“׳¨׳•׳’ ׳׳׳¡׳׳•׳ ׳׳×׳§׳“׳
                </Text>
                <Text className={`mt-1 text-xs text-[#4F6387] ${tw.textStart}`}>
                  ׳”׳׳¡׳׳•׳ ׳”׳ ׳•׳›׳—׳™: {entitlements?.plan
                    ? BUSINESS_PLAN_LABELS[entitlements.plan]
                    : 'Starter'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleUpgradeFromBanner}
                className="rounded-xl border border-[#2F6BFF] bg-white px-4 py-2.5"
              >
                <Text className="text-sm font-bold text-[#2F6BFF]">
                  ׳׳¦׳₪׳™׳™׳” ׳‘׳—׳‘׳™׳׳•׳×
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <View className="space-y-3 py-6">
          <PrimaryButton
            title="׳¡׳¨׳™׳§׳× ׳׳§׳•׳—"
            onPress={() => router.push('/(authenticated)/(business)/scanner')}
          />
          <TouchableOpacity
            onPress={() => router.push('/merchant/qr')}
            className="items-center justify-center rounded-2xl border border-[#A9C7FF] bg-[#EEF3FF] px-4 py-3"
          >
            <Text className="text-sm font-bold text-[#2F6BFF]">QR ׳¢׳¡׳§</Text>
          </TouchableOpacity>
        </View>

        <View>
          <Card className="rounded-2xl border border-[#E3E9FF] bg-white p-4 space-y-3">
            <Text
              className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}
            >
              {'\u05e7\u05d9\u05e6\u05d5\u05e8\u05d9 \u05d3\u05e8\u05da'}
            </Text>
            <View className={`${tw.flexRow} flex-wrap gap-3`}>
              {QUICK_SHORTCUT_TILES.map((shortcut) => (
                <TouchableOpacity
                  key={shortcut.id}
                  onPress={() => router.push(shortcut.route)}
                  className="rounded-2xl border border-[#DCE6F7] bg-[#F6F9FF] p-3 active:scale-[0.98]"
                  style={{ width: shortcut.fullWidth ? '100%' : '48.5%' }}
                >
                  <View className={`${tw.flexRow} items-center gap-2`}>
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-white">
                      <Ionicons
                        name={shortcut.icon}
                        size={18}
                        color="#2F6BFF"
                      />
                    </View>
                    <View className="flex-1 items-end">
                      <Text
                        className={`text-sm font-extrabold text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {shortcut.title}
                      </Text>
                      <Text
                        className={`mt-0.5 text-[11px] text-[#6E7D97] ${tw.textStart}`}
                      >
                        {shortcut.subtitle}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>

        <View>
          <View className={`${tw.flexRow} flex-wrap justify-between gap-3`}>
            {kpiCards.map((card) => (
              <StatCard
                key={card.id}
                value={card.value}
                label={card.label}
                icon={card.icon}
                accent={card.accent}
              />
            ))}
          </View>
        </View>

        {isAnalyticsLoading && (
          <View className="mt-3">
            <View
              className={`rounded-2xl border border-[#E3E9FF] bg-white px-4 py-3 ${tw.flexRow} items-center justify-center gap-2`}
            >
              <ActivityIndicator color="#2F6BFF" />
              <Text className="text-xs text-[#7B86A0]">
                ׳˜׳•׳¢׳ ׳ ׳×׳•׳ ׳™׳ ׳¢׳“׳›׳ ׳™׳™׳...
              </Text>
            </View>
          </View>
        )}

        <View className="mt-6 space-y-3">
          {ACTION_CARDS.filter((action) => action.id !== 'team' || isOwner).map(
            (action) => {
              const isTeamAction = action.id === 'team';
              const isLocked = isTeamAction && teamGate.isLocked;
              const card = (
                <TouchableOpacity
                  key={action.id}
                  onPress={() => {
                    if (action.id === 'team') {
                      if (teamGate.isLocked) {
                        openUpgrade(
                          'canManageTeam',
                          teamGate.requiredPlan,
                          teamGate.reason === 'subscription_inactive'
                            ? 'subscription_inactive'
                            : 'feature_locked'
                        );
                        return;
                      }
                      router.push('/(authenticated)/(business)/team');
                      return;
                    }

                    if (action.id === 'card-settings') {
                      router.push('/(authenticated)/(business)/cards');
                    }
                  }}
                  className={`${tw.flexRow} items-center justify-between rounded-[26px] border border-[#E3E9FF] bg-white px-5 py-5 shadow-sm active:scale-[0.98]`}
                >
                  <View className={`${tw.flexRow} items-center gap-3`}>
                    <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#D4EDFF]">
                      <Text className="text-2xl">{action.icon}</Text>
                    </View>
                    <View className="items-end">
                      <Text
                        className={`text-base font-bold text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {action.title}
                      </Text>
                      <Text
                        className={`text-[10px] text-[#7B86A0] ${tw.textStart}`}
                      >
                        {action.subtitle}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-blue-300 text-xl">›</Text>
                </TouchableOpacity>
              );

              if (!isLocked) {
                return card;
              }

              return (
                <LockedFeatureWrapper
                  key={action.id}
                  isLocked
                  requiredPlan={teamGate.requiredPlan}
                  onUpgradeClick={() =>
                    openUpgrade(
                      'canManageTeam',
                      teamGate.requiredPlan,
                      teamGate.reason === 'subscription_inactive'
                        ? 'subscription_inactive'
                        : 'feature_locked'
                    )
                  }
                  title="ניהול צוות נעול"
                  subtitle="הזמנת עובדים והרשאות זמינות במסלול Pro ומעלה."
                >
                  {card}
                </LockedFeatureWrapper>
              );
            }
          )}
        </View>

        <View className="mt-6">
          <LockedFeatureWrapper
            isLocked={marketingGate.isLocked}
            requiredPlan={marketingGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canUseMarketingHubAI',
                marketingGate.requiredPlan,
                marketingGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="Marketing Hub AI"
            subtitle="יצירת קמפייני AI דורשת מסלול Pro ומעלה."
            benefits={[
              'יצירת קמפיינים חכמים בלחיצה',
              'תובנות סיכון ושימור לקוחות',
              'סגמנטציה מתקדמת',
            ]}
          >
            <View
              className={`${tw.flexRow} items-center justify-between gap-4 rounded-[26px] border border-[#E3E9FF] bg-white p-5`}
            >
              <View className="h-14 w-14 items-center justify-center rounded-[26px] bg-[#D4EDFF]">
                <Text className="text-3xl text-blue-200">AI</Text>
              </View>
              <View className="flex-1 items-end">
                <Text
                  className={`text-lg font-bold text-[#1A2B4A] ${tw.textStart}`}
                >
                  Marketing Hub AI
                </Text>
                <Text className={`mt-1 text-xs text-[#7B86A0] ${tw.textStart}`}>
                  קמפיינים החודש: {aiUsageLabel}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  void handleCreateAiCampaign();
                }}
                disabled={isCreatingAiCampaign}
                className="rounded-xl border border-[#A9C7FF] bg-[#EEF3FF] px-4 py-2.5"
              >
                {isCreatingAiCampaign ? (
                  <ActivityIndicator color="#2F6BFF" />
                ) : (
                  <Text className="text-sm font-bold text-[#2F6BFF]">
                    יצירת קמפיין
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </LockedFeatureWrapper>

          {!marketingGate.isLocked && (
            <Text className={`mt-2 text-xs text-[#5B6475] ${tw.textStart}`}>
              נשארו {aiCampaignLimit.remaining ?? 'ללא הגבלה'} קמפייני AI בחודש הנוכחי.
            </Text>
          )}
        </View>

        <View className="mt-8">
          <SectionHeader title="׳₪׳¢׳™׳׳•׳× ׳׳—׳¨׳•׳ ׳”" />
          <View className="space-y-3 mt-3">
            {ACTIVITY_FEED.map((item) => (
              <ListRow
                key={item.id}
                title={item.customer}
                subtitle={
                  item.type === 'punch' ? '׳§׳™׳‘׳/׳” ׳ ׳™׳§׳•׳‘ 1' : '׳׳™׳׳©/׳” ׳”׳˜׳‘׳” נ‰'
                }
                subtitleClassName={
                  item.type === 'punch' ? 'text-gray-400' : 'text-blue-600'
                }
                leading={
                  <View className="h-12 w-12 rounded-2xl bg-[#D4EDFF]" />
                }
                trailing={
                  <Text className="text-[11px] font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded-lg">
                    {item.time}
                  </Text>
                }
              />
            ))}
          </View>
        </View>

        <UpgradeModal
          visible={isUpgradeVisible}
          businessId={selectedBusinessId}
          initialPlan={upgradePlan}
          reason={upgradeReason}
          featureKey={upgradeFeatureKey}
          onClose={() => setIsUpgradeVisible(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

