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
import { Card, ListRow, SectionHeader, StatCard } from '@/components/ui';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
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
    id: 'team',
    title: 'ניהול צוות עובדים',
    subtitle: 'הרשאות, משמרות וניטור פעילות',
    icon: '👥',
  },
];

const QUICK_SHORTCUT_TILES: QuickShortcutTile[] = [
  {
    id: 'business-qr',
    title: 'QR עסק',
    subtitle: 'קוד הצטרפות ללקוחות',
    icon: 'qr-code-outline',
    route: '/merchant/qr',
  },
  {
    id: 'store-settings',
    title: 'הגדרות חנות',
    subtitle: 'פרטי העסק והעדפות',
    icon: 'storefront-outline',
    route: {
      pathname: '/(authenticated)/(business)/settings',
      params: { section: 'store' },
    },
  },
  {
    id: 'profile-settings',
    title: 'הגדרות פרופיל',
    subtitle: 'חשבון והרשאות',
    icon: 'person-circle-outline',
    route: {
      pathname: '/(authenticated)/(business)/settings',
      params: { section: 'profile' },
    },
  },
  {
    id: 'staff-qr',
    title: 'QR לעובדים',
    subtitle: 'סריקת צוות',
    icon: 'qr-code-outline',
    route: '/(authenticated)/(business)/qr',
    fullWidth: true,
  },
];

const ACTIVITY_FEED: Activity[] = [
  { id: '1', customer: 'ישראל ישראלי', type: 'punch', time: '10:42' },
  { id: '2', customer: 'מיכל לוי', type: 'reward', time: '09:15' },
  { id: '3', customer: 'דני כהן', type: 'punch', time: '08:50' },
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

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const isOwner = activeBusiness?.staffRole === 'owner';
  const { entitlements, gate, limitStatus } =
    useEntitlements(activeBusinessId);
  const teamGate = gate('canManageTeam');
  const marketingGate = gate('canUseMarketingHubAI');
  const aiCampaignLimit = limitStatus('maxAiCampaignsPerMonth');
  const aiCampaignsData = useQuery(
    api.campaigns.listAiCampaignsByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const createAiCampaign = useMutation(api.campaigns.createAiCampaign);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
  const [isCreatingAiCampaign, setIsCreatingAiCampaign] = useState(false);

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

  const analyticsArgs = activeBusinessId
    ? { businessId: activeBusinessId }
    : 'skip';
  const analytics = useQuery(api.analytics.getBusinessActivity, analyticsArgs);
  const today = analytics?.daily?.at(-1);
  const weeklyUnique = analytics?.totals?.uniqueCustomers ?? 0;
  const weeklyRedemptions = analytics?.totals?.redemptions ?? 0;
  const isAnalyticsLoading = !!activeBusinessId && analytics === undefined;

  const kpiCards = [
    {
      id: 'punches',
      label: 'ניקובים היום',
      value: formatNumber(today?.stamps ?? 0),
      accent: 'bg-blue-50',
      icon: '📌',
    },
    {
      id: 'new-customers',
      label: 'לקוחות פעילים השבוע',
      value: formatNumber(weeklyUnique),
      accent: 'bg-emerald-50',
      icon: '👥',
    },
    {
      id: 'redemptions',
      label: 'הטבות השבוע',
      value: formatNumber(weeklyRedemptions),
      accent: 'bg-orange-50',
      icon: '🎁',
    },
  ];

  const aiUsageUsed =
    aiCampaignsData?.usage?.used ??
    entitlements?.usage.aiCampaignsUsedThisMonth ??
    0;
  const aiUsageLimit =
    aiCampaignsData?.usage?.limit ??
    entitlements?.limits.maxAiCampaignsPerMonth ??
    0;
  const aiUsageLabel =
    aiUsageLimit === -1
      ? `${aiUsageUsed}/ללא הגבלה`
      : `${aiUsageUsed}/${aiUsageLimit}`;
  const visibleActionCards = ACTION_CARDS.filter(
    (action) => action.id !== 'team' || isOwner
  );

  const handleUpgradeFromBanner = () => {
    openUpgrade('canUseMarketingHubAI', 'pro', 'feature_locked');
  };

  const handleCreateAiCampaign = async () => {
    if (!activeBusinessId || isCreatingAiCampaign) {
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
        businessId: activeBusinessId,
        title: 'קמפיין AI חדש',
        prompt: 'הציעו מבצע החזרה ללקוחות שלא ביקרו בשבוע האחרון.',
      });
      Alert.alert('בוצע', 'טיוטת קמפיין AI נוצרה בהצלחה.');
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
        Alert.alert(
          'שדרוג נדרש',
          entitlementErrorToHebrewMessage(entitlementError)
        );
      } else {
        Alert.alert('שגיאה', 'לא הצלחנו ליצור קמפיין AI. נסו שוב.');
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
            title="מרכז ניהול"
            subtitle="תמונת מצב מהירה של הפעילות בעסק"
          />
        </View>
        <View className="hidden px-5 pb-4 pt-2">
          <View className={`${tw.flexRow} items-center justify-between`}>
            <View className={`${tw.flexRow} items-center gap-3`}>
              <View className="h-12 w-12 rounded-full bg-[#D4EDFF]" />
              <Text
                className={`text-[24px] font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                שלום, קפה ארומה ☕
              </Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Text className="text-2xl text-[#2F6BFF]">🔔</Text>
            </View>
          </View>
          <Text className={`mt-1 text-sm text-[#2F6BFF] ${tw.textStart}`}>
            כאן סקירה מהירה של הפעילות היומית בעסק
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
                  שדרוג למסלול מתקדם
                </Text>
                <Text className={`mt-1 text-xs text-[#4F6387] ${tw.textStart}`}>
                  המסלול הנוכחי:{' '}
                  {entitlements?.plan
                    ? BUSINESS_PLAN_LABELS[entitlements.plan]
                    : 'Starter'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleUpgradeFromBanner}
                className="rounded-xl border border-[#2F6BFF] bg-white px-4 py-2.5"
              >
                <Text className="text-sm font-bold text-[#2F6BFF]">
                  לצפייה בחבילות
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <View>
          <Card className="rounded-2xl border border-[#E3E9FF] bg-white p-4 gap-3">
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
                טוען נתונים עדכניים...
              </Text>
            </View>
          </View>
        )}

        {visibleActionCards.length > 0 && (
          <View className="mt-6 gap-3">
            {visibleActionCards.map((action) => {
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
                  isLocked={true}
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
            })}
          </View>
        )}

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
              נשארו {aiCampaignLimit.remaining ?? 'ללא הגבלה'} קמפייני AI בחודש
              הנוכחי.
            </Text>
          )}
        </View>

        <View className="mt-8">
          <SectionHeader title="פעילות אחרונה" />
          <View className="mt-3 gap-3">
            {ACTIVITY_FEED.map((item) => (
              <ListRow
                key={item.id}
                title={item.customer}
                subtitle={
                  item.type === 'punch' ? 'קיבל/ה ניקוב 1' : 'מימש/ה הטבה 🎉'
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
          businessId={activeBusinessId}
          initialPlan={upgradePlan}
          reason={upgradeReason}
          featureKey={upgradeFeatureKey}
          onClose={() => setIsUpgradeVisible(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
