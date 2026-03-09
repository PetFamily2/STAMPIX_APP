import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
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
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
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
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

const PLAN_LABELS = {
  starter: 'Starter',
  pro: 'Pro AI',
  premium: 'Premium AI',
} as const;

type OpportunityKey = 'at_risk' | 'near_reward' | 'vip' | 'new_customers';

type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'cards',
    title: 'כרטיסי נאמנות',
    subtitle: 'ניהול הכרטיסים של העסק',
    icon: 'card-outline',
    route: '/(authenticated)/(business)/cards',
  },
  {
    id: 'customers',
    title: 'לקוחות',
    subtitle: 'רשימת לקוחות וסטטוסים',
    icon: 'people-outline',
    route: '/(authenticated)/(business)/customers',
  },
  {
    id: 'analytics',
    title: 'דוחות',
    subtitle: 'פעילות, צמיחה ושימוש',
    icon: 'bar-chart-outline',
    route: '/(authenticated)/(business)/analytics',
  },
  {
    id: 'subscription',
    title: 'מסלול וחיוב',
    subtitle: 'שימוש, מגבלות ושדרוג',
    icon: 'sparkles-outline',
    route: '/(authenticated)/(business)/settings-business-subscription',
  },
];

const DEFAULT_RETENTION_MESSAGES: Record<
  OpportunityKey,
  { title: string; body: string }
> = {
  at_risk: {
    title: 'חסר לנו לראות אתכם',
    body: 'עבר זמן מאז הביקור האחרון. נשמח לראות אתכם שוב בקרוב.',
  },
  near_reward: {
    title: 'אתם קרובים להטבה',
    body: 'נשאר לכם עוד צעד קטן עד ההטבה הבאה. שווה לקפוץ שוב.',
  },
  vip: {
    title: 'תודה שאתם איתנו',
    body: 'רצינו להגיד תודה ללקוחות הכי פעילים שלנו.',
  },
  new_customers: {
    title: 'ברוכים הבאים',
    body: 'שמחים שהצטרפתם. מחכים לכם גם בביקור הבא.',
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

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
  const isOwnerOrManager =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const activity = useQuery(
    api.analytics.getBusinessActivity,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const usageSummary = useQuery(
    api.entitlements.getBusinessUsageSummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const recentActivity = useQuery(
    api.events.getRecentActivity,
    activeBusinessId ? { businessId: activeBusinessId, limit: 5 } : 'skip'
  );

  const { entitlements, gate, limitStatus } = useEntitlements(activeBusinessId);
  const teamGate = gate('team');
  const marketingGate = gate('marketingHub');
  const teamCopy = getLockedAreaCopy('team', teamGate.requiredPlan);
  const marketingCopy = getLockedAreaCopy(
    'marketingHub',
    marketingGate.requiredPlan
  );

  const marketingHubSnapshot = useQuery(
    api.retention.getMarketingHubSnapshot,
    activeBusinessId && entitlements && !marketingGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const createAiSuggestion = useMutation(
    api.retention.createAiRetentionSuggestion
  );
  const createRetentionAction = useMutation(
    api.retention.createRetentionAction
  );

  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
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

  const handleRetentionError = (error: unknown, fallbackFeature: string) => {
    const entitlementError = getEntitlementError(error);
    if (entitlementError) {
      openUpgrade(
        entitlementError.featureKey ?? fallbackFeature,
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
      return true;
    }
    return false;
  };

  const handleCreateAiSuggestion = async (targetType: OpportunityKey) => {
    if (!activeBusinessId || activeActionId) {
      return;
    }

    if (marketingGate.isLocked) {
      openUpgrade(
        'marketingHub',
        marketingGate.requiredPlan,
        marketingGate.reason === 'subscription_inactive'
          ? 'subscription_inactive'
          : 'feature_locked'
      );
      return;
    }

    setActiveActionId(`ai:${targetType}`);
    try {
      const result = await createAiSuggestion({
        businessId: activeBusinessId,
        targetType,
      });
      Alert.alert(
        'הצעת AI נוצרה',
        `${result.suggestion.title}\n\n${result.suggestion.messageBody}`
      );
    } catch (error) {
      if (!handleRetentionError(error, 'marketingHub')) {
        Alert.alert('שגיאה', 'לא הצלחנו ליצור הצעת AI. נסו שוב.');
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const handleSendRetentionAction = async (
    targetType: OpportunityKey,
    channel: 'push' | 'in_app'
  ) => {
    if (!activeBusinessId || activeActionId) {
      return;
    }

    if (marketingGate.isLocked) {
      openUpgrade(
        'marketingHub',
        marketingGate.requiredPlan,
        marketingGate.reason === 'subscription_inactive'
          ? 'subscription_inactive'
          : 'feature_locked'
      );
      return;
    }

    const message = DEFAULT_RETENTION_MESSAGES[targetType];
    setActiveActionId(`${channel}:${targetType}`);
    try {
      const result = await createRetentionAction({
        businessId: activeBusinessId,
        targetType,
        title: message.title,
        messageBody: message.body,
        channels: [channel],
      });
      Alert.alert(
        'פעולת שימור הופעלה',
        `${result.audienceCount} לקוחות בקהל היעד`
      );
    } catch (error) {
      if (!handleRetentionError(error, 'marketingHub')) {
        Alert.alert('שגיאה', 'לא הצלחנו לבצע את הפעולה. נסו שוב.');
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const cardsStatus = limitStatus('maxCards', usageSummary?.cardsUsed ?? 0);
  const customersStatus = limitStatus(
    'maxCustomers',
    usageSummary?.customersUsed ?? 0
  );
  const aiStatus = limitStatus(
    'maxActiveRetentionActions',
    usageSummary?.activeRetentionActionsUsed ??
      entitlements?.usage.activeRetentionActions ??
      0
  );

  const usageWarnings = [
    cardsStatus.isNearLimit || cardsStatus.isAtLimit
      ? `כרטיסים: ${cardsStatus.currentValue}/${cardsStatus.limitValue}`
      : null,
    customersStatus.isNearLimit || customersStatus.isAtLimit
      ? `לקוחות: ${customersStatus.currentValue}/${customersStatus.limitValue}`
      : null,
    aiStatus.isNearLimit || aiStatus.isAtLimit
      ? `קמפייני שימור פעילים: ${aiStatus.currentValue}/${aiStatus.limitValue}`
      : null,
  ].filter((value): value is string => Boolean(value));

  const today = activity?.daily?.at(-1);
  const kpiCards = [
    {
      id: 'stamps',
      label: 'ניקובים היום',
      value: formatNumber(today?.stamps ?? 0),
    },
    {
      id: 'customers',
      label: 'לקוחות פעילים השבוע',
      value: formatNumber(activity?.totals?.uniqueCustomers ?? 0),
    },
    {
      id: 'redemptions',
      label: 'מימושים השבוע',
      value: formatNumber(activity?.totals?.redemptions ?? 0),
    },
  ];

  const missingFields =
    businessSettings?.profileCompletion?.missingFields ?? [];

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
        <BusinessScreenHeader
          title="מרכז ניהול"
          subtitle="תמונה ברורה של השימוש, הלקוחות וההזדמנויות לשימור"
        />

        {businessSettings?.profileCompletion &&
        !businessSettings.profileCompletion.isComplete ? (
          <View className="mt-3 rounded-[22px] border border-[#FCD34D] bg-[#FFFBEB] p-4">
            <Text
              className={`text-sm font-extrabold text-[#92400E] ${tw.textStart}`}
            >
              השלמת פרטי העסק
            </Text>
            <Text className={`mt-1 text-xs text-[#78350F] ${tw.textStart}`}>
              חסרים עדיין {missingFields.length} שדות. השלמת הפרופיל משפרת את
              חוויית הלקוחות ואת מסכי הניהול.
            </Text>
            {isOwnerOrManager ? (
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    '/(authenticated)/(business)/settings-business-profile'
                  )
                }
                className="mt-3 self-end rounded-xl border border-[#F59E0B] bg-white px-4 py-2"
              >
                <Text className="text-xs font-bold text-[#92400E]">
                  השלמת פרופיל
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View className="mt-3 rounded-[26px] border border-[#A9C7FF] bg-[#EEF3FF] p-5">
          <View className={`${tw.flexRow} items-center justify-between gap-4`}>
            <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white">
              <Text className="text-center text-xs font-black text-[#2F6BFF]">
                {PLAN_LABELS[entitlements?.plan ?? 'starter']}
              </Text>
            </View>
            <View className="flex-1 items-end">
              <Text
                className={`text-lg font-extrabold text-[#1A2B4A] ${tw.textStart}`}
              >
                שימוש במסלול
              </Text>
              <Text className={`mt-1 text-xs text-[#4F6387] ${tw.textStart}`}>
                כרטיסים {usageSummary?.cardsUsed ?? 0}/{cardsStatus.limitValue}
                {' • '}לקוחות {usageSummary?.customersUsed ?? 0}/
                {customersStatus.limitValue}
                {' • '}קמפיינים פעילים{' '}
                {usageSummary?.activeRetentionActionsUsed ?? 0}/
                {aiStatus.limitValue}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push(
                  '/(authenticated)/(business)/settings-business-subscription'
                )
              }
              className="rounded-xl border border-[#2F6BFF] bg-white px-4 py-2.5"
            >
              <Text className="text-sm font-bold text-[#2F6BFF]">
                ניהול מסלול
              </Text>
            </TouchableOpacity>
          </View>

          {usageWarnings.length > 0 ? (
            <View className="mt-3 rounded-2xl border border-[#F59E0B] bg-[#FFF7ED] p-3">
              <Text
                className={`text-xs font-bold text-[#B45309] ${tw.textStart}`}
              >
                מתקרבים למגבלה
              </Text>
              {usageWarnings.map((warning) => (
                <Text
                  key={warning}
                  className={`mt-1 text-xs text-[#C2410C] ${tw.textStart}`}
                >
                  • {warning}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View className="mt-4">
          <View className={`${tw.flexRow} flex-wrap gap-3`}>
            {QUICK_ACTIONS.map((shortcut) => (
              <TouchableOpacity
                key={shortcut.id}
                onPress={() => router.push(shortcut.route)}
                className="w-[48.5%] rounded-2xl border border-[#DCE6F7] bg-white p-4 active:scale-[0.98]"
              >
                <View className={`${tw.flexRow} items-center gap-2`}>
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EEF3FF]">
                    <Ionicons name={shortcut.icon} size={18} color="#2F6BFF" />
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
        </View>

        <View className="mt-4">
          <View className={`${tw.flexRow} flex-wrap justify-between gap-3`}>
            {kpiCards.map((card) => (
              <View
                key={card.id}
                className="w-[31.5%] rounded-2xl border border-[#E3E9FF] bg-white p-4"
              >
                <Text className="text-right text-xs font-semibold text-[#64748B]">
                  {card.label}
                </Text>
                <Text className="mt-2 text-right text-2xl font-black text-[#0F294B]">
                  {card.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mt-5">
          <FeatureGate
            isLocked={teamGate.isLocked}
            requiredPlan={teamGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'team',
                teamGate.requiredPlan,
                teamGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={teamCopy.lockedTitle}
            subtitle={teamCopy.lockedSubtitle}
            benefits={teamCopy.benefits}
          >
            <TouchableOpacity
              onPress={() => {
                if (teamGate.isLocked) {
                  openUpgrade(
                    'team',
                    teamGate.requiredPlan,
                    teamGate.reason === 'subscription_inactive'
                      ? 'subscription_inactive'
                      : 'feature_locked'
                  );
                  return;
                }
                router.push('/(authenticated)/(business)/team');
              }}
              className={`${tw.flexRow} items-center justify-between rounded-[26px] border border-[#E3E9FF] bg-white px-5 py-5`}
            >
              <View className={`${tw.flexRow} items-center gap-3`}>
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#D4EDFF]">
                  <Ionicons name="people-outline" size={22} color="#2F6BFF" />
                </View>
                <View className="items-end">
                  <Text
                    className={`text-base font-bold text-[#1A2B4A] ${tw.textStart}`}
                  >
                    ניהול צוות
                  </Text>
                  <Text
                    className={`text-[11px] text-[#7B86A0] ${tw.textStart}`}
                  >
                    הזמנות עובדים והרשאות גישה
                  </Text>
                </View>
              </View>
              <Text className="text-xl text-blue-300">›</Text>
            </TouchableOpacity>
          </FeatureGate>
        </View>

        <View className="mt-5">
          <FeatureGate
            isLocked={marketingGate.isLocked}
            requiredPlan={marketingGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'marketingHub',
                marketingGate.requiredPlan,
                marketingGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={marketingCopy.lockedTitle}
            subtitle={marketingCopy.lockedSubtitle}
            benefits={marketingCopy.benefits}
          >
            <View className="rounded-[26px] border border-[#E3E9FF] bg-white p-5">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <View className="items-end">
                  <Text
                    className={`text-lg font-extrabold text-[#1A2B4A] ${tw.textStart}`}
                  >
                    {marketingCopy.sectionTitle}
                  </Text>
                  <Text
                    className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                  >
                    קמפייני שימור פעילים:{' '}
                    {usageSummary?.activeRetentionActionsUsed ?? 0}/
                    {aiStatus.limitValue}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    router.push('/(authenticated)/(business)/customers')
                  }
                  className="rounded-xl border border-[#A9C7FF] bg-[#EEF3FF] px-4 py-2.5"
                >
                  <Text className="text-sm font-bold text-[#2F6BFF]">
                    לפתיחת המרכז
                  </Text>
                </TouchableOpacity>
              </View>

              {marketingGate.isLocked ? null : marketingHubSnapshot ===
                undefined ? (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator color="#2F6BFF" />
                </View>
              ) : (
                <>
                  <View className="mt-4 gap-3">
                    {marketingHubSnapshot.opportunityCards.map((card) => {
                      const targetType = card.key as OpportunityKey;
                      return (
                        <View
                          key={card.key}
                          className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
                        >
                          <View
                            className={`${tw.flexRow} items-center justify-between`}
                          >
                            <View className="rounded-full bg-[#DBEAFE] px-3 py-1">
                              <Text className="text-xs font-bold text-[#1D4ED8]">
                                {formatNumber(card.count)}
                              </Text>
                            </View>
                            <View className="flex-1 items-end px-3">
                              <Text
                                className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                              >
                                {card.title}
                              </Text>
                              <Text
                                className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                              >
                                {card.description}
                              </Text>
                            </View>
                          </View>

                          <Text
                            className={`mt-3 text-xs font-semibold text-[#334155] ${tw.textStart}`}
                          >
                            הצעה: {card.suggestedAction}
                          </Text>

                          <View className={`${tw.flexRow} mt-3 gap-2`}>
                            <TouchableOpacity
                              onPress={() => {
                                void handleSendRetentionAction(
                                  targetType,
                                  'push'
                                );
                              }}
                              disabled={activeActionId !== null}
                              className="flex-1 rounded-xl bg-[#0F766E] px-3 py-2"
                            >
                              <Text className="text-center text-xs font-bold text-white">
                                {activeActionId === `push:${targetType}`
                                  ? 'מפעיל...'
                                  : 'הפעלת פוש'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                void handleSendRetentionAction(
                                  targetType,
                                  'in_app'
                                );
                              }}
                              disabled={activeActionId !== null}
                              className="flex-1 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2"
                            >
                              <Text className="text-center text-xs font-bold text-[#334155]">
                                {activeActionId === `in_app:${targetType}`
                                  ? 'מפעיל...'
                                  : 'הפעלת הודעה באפליקציה'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                void handleCreateAiSuggestion(targetType);
                              }}
                              disabled={activeActionId !== null}
                              className="flex-1 rounded-xl bg-[#1D4ED8] px-3 py-2"
                            >
                              <Text className="text-center text-xs font-bold text-white">
                                {activeActionId === `ai:${targetType}`
                                  ? 'יוצר...'
                                  : 'הצעת AI'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View className="mt-4 rounded-2xl border border-[#E3E9FF] bg-[#182F4E] p-4">
                    <Text
                      className={`text-sm font-black text-[#7EB1FF] ${tw.textStart}`}
                    >
                      תובנות שימור
                    </Text>
                    {marketingHubSnapshot.insights.length === 0 ? (
                      <Text
                        className={`mt-2 text-xs text-[#E2E8F6] ${tw.textStart}`}
                      >
                        אין כרגע תובנות להצגה.
                      </Text>
                    ) : (
                      marketingHubSnapshot.insights.map((insight) => (
                        <Text
                          key={insight}
                          className={`mt-2 text-xs leading-5 text-[#E2E8F6] ${tw.textStart}`}
                        >
                          • {insight}
                        </Text>
                      ))
                    )}
                  </View>
                </>
              )}
            </View>
          </FeatureGate>
        </View>

        <View className="mt-8">
          <Text className={`text-lg font-black text-[#1A2B4A] ${tw.textStart}`}>
            פעילות אחרונה
          </Text>
          <View className="mt-3 gap-3">
            {recentActivity === undefined ? (
              <View className="items-center justify-center py-8">
                <ActivityIndicator color="#2F6BFF" />
              </View>
            ) : recentActivity.length === 0 ? (
              <View className="rounded-2xl border border-[#E3E9FF] bg-white p-4">
                <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                  עדיין אין פעילות אחרונה להצגה.
                </Text>
              </View>
            ) : (
              recentActivity.map((item) => (
                <View
                  key={item.id}
                  className="rounded-2xl border border-[#E3E9FF] bg-white p-4"
                >
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="rounded-full bg-[#EEF3FF] px-3 py-1 text-[11px] font-bold text-[#2F6BFF]">
                      {item.time}
                    </Text>
                    <View className="flex-1 items-end px-3">
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
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
