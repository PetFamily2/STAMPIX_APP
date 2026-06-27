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
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import {
  HorizontalRankingChart,
  InsightCard,
  KpiCard,
  UsageProgressBar,
} from '@/components/business-ui';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { alignItems, flexDirection, textAlign, tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type ManagementCampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';
type MarketingTopTab = 'campaigns' | 'loyalty';
const TEXT_START = textAlign.start;
const TEXT_END = textAlign.end;
const PLAN_LABELS = {
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
} as const;

type ManagementCampaign = {
  campaignId: Id<'campaigns'>;
  businessId: Id<'businesses'>;
  programId: Id<'loyaltyPrograms'> | null;
  type: ManagementCampaignType;
  title: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  automationEnabled: boolean;
  lifecycle: 'active' | 'inactive' | 'archived';
  canArchive: boolean;
  estimatedAudience: number;
  reachedMessagesAllTime: number;
  lastSentAt: number | null;
  archivedAt: number | null;
  updatedAt: number;
};

const _TOP_TABS: Array<{ key: MarketingTopTab; label: string }> = [
  { key: 'campaigns', label: 'קמפיינים' },
  { key: 'loyalty', label: 'כרטיסיות נאמנות' },
];

function formatDateTime(value: number | null) {
  if (!value) {
    return 'טרם נשלח';
  }
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function campaignTypeMeta(type: ManagementCampaignType): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBgClass: string;
} {
  switch (type) {
    case 'welcome':
      return {
        label: 'ברוכים הבאים',
        icon: 'hand-left-outline',
        iconColor: '#1D4ED8',
        iconBgClass: 'bg-[#DBEAFE]',
      };
    case 'birthday':
      return {
        label: 'יום הולדת',
        icon: 'gift-outline',
        iconColor: '#C2410C',
        iconBgClass: 'bg-[#FFEDD5]',
      };
    case 'anniversary':
      return {
        label: 'יום נישואין',
        icon: 'heart-outline',
        iconColor: '#9D174D',
        iconBgClass: 'bg-[#FCE7F3]',
      };
    case 'winback':
      return {
        label: 'השבת לקוחות',
        icon: 'refresh-outline',
        iconColor: '#0F766E',
        iconBgClass: 'bg-[#CCFBF1]',
      };
    case 'promo':
      return {
        label: 'מבצע כללי',
        icon: 'megaphone-outline',
        iconColor: '#4C1D95',
        iconBgClass: 'bg-[#EDE9FE]',
      };
    default:
      return {
        label: 'קמפיין',
        icon: 'megaphone-outline',
        iconColor: '#1D4ED8',
        iconBgClass: 'bg-[#DBEAFE]',
      };
  }
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

function MarketingAccessTile({
  eyebrow,
  title,
  body,
  accentColor,
  accentBg,
}: {
  eyebrow: string;
  title: string;
  body: string;
  accentColor: string;
  accentBg: string;
}) {
  return (
    <View
      style={[
        styles.accessTile,
        {
          borderColor: accentBg,
          backgroundColor: '#F8FAFF',
        },
      ]}
    >
      <Text style={[styles.accessTileEyebrow, { color: accentColor }]}>
        {eyebrow}
      </Text>
      <Text style={styles.accessTileTitle}>{title}</Text>
      <Text style={styles.accessTileBody}>{body}</Text>
    </View>
  );
}

export function CampaignsHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canCreateCampaigns = businessCapabilities?.create_campaigns === true;
  const canEditCampaigns = businessCapabilities?.edit_campaigns === true;
  const canViewCampaigns = businessCapabilities?.access_campaigns === true;
  const {
    entitlements,
    limitStatus,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(activeBusinessId);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const campaignsQuery = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const referralConfig = useQuery(
    api.referrals.getReferralConfig,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const campaigns = (campaignsQuery ?? []) as ManagementCampaign[];
  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];

  const restoreManagementCampaign = useMutation(
    api.campaigns.restoreManagementCampaign
  );

  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [isInactiveExpanded, setIsInactiveExpanded] = useState(false);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);

  const programNameById = useMemo(() => {
    const mapById = new Map<string, string>();
    for (const program of programs) {
      mapById.set(String(program.loyaltyProgramId), program.title);
    }
    return mapById;
  }, [programs]);

  const activeCampaigns = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaign.lifecycle !== 'archived')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [campaigns]
  );
  const liveCampaigns = useMemo(
    () => activeCampaigns.filter((campaign) => campaign.lifecycle === 'active'),
    [activeCampaigns]
  );
  const inactiveCampaigns = useMemo(
    () =>
      activeCampaigns.filter((campaign) => campaign.lifecycle === 'inactive'),
    [activeCampaigns]
  );
  const archivedCampaigns = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaign.lifecycle === 'archived')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [campaigns]
  );
  const automatedCampaignsCount = activeCampaigns.reduce(
    (sum, campaign) => sum + (campaign.automationEnabled ? 1 : 0),
    0
  );
  const totalMessagesSent = activeCampaigns.reduce(
    (sum, campaign) => sum + campaign.reachedMessagesAllTime,
    0
  );
  const topReachCampaigns = useMemo(
    () =>
      activeCampaigns
        .slice()
        .sort(
          (a, b) =>
            (b.reachedMessagesAllTime ?? 0) - (a.reachedMessagesAllTime ?? 0)
        )
        .slice(0, 5)
        .map((campaign) => ({
          label: campaign.title,
          value: Number(campaign.reachedMessagesAllTime ?? 0),
        })),
    [activeCampaigns]
  );
  const bestReachCampaign = topReachCampaigns[0] ?? null;
  const isReferralConfigLoading = referralConfig === undefined;
  const isReferralCampaignActive = referralConfig?.isEnabled !== false;
  const referralCampaignBadgeLabel = isReferralConfigLoading
    ? 'טוען'
    : isReferralCampaignActive
      ? 'פעיל'
      : 'כבוי';
  const campaignLimit = limitStatus('maxCampaigns');
  const recurringLimit = limitStatus('maxActiveRetentionActions');
  const aiExecutionsLimit = limitStatus('maxAiExecutionsPerMonth');
  const requiredPlanForCampaigns =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCampaigns ?? 'pro';
  const requiredPlanForRecurring =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxActiveRetentionActions ?? 'pro';
  const requiredPlanForAi =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxAiExecutionsPerMonth ?? 'pro';
  const recurringQuotaCopy = getLockedAreaCopy(
    'maxActiveRetentionActions',
    requiredPlanForRecurring
  );
  const aiQuotaCopy = getLockedAreaCopy(
    'maxAiExecutionsPerMonth',
    requiredPlanForAi
  );
  const currentPlanLabel = entitlements ? PLAN_LABELS[entitlements.plan] : null;
  const hasReliableRecurringEntitlementData =
    !isEntitlementsLoading &&
    entitlements !== null &&
    Number.isFinite(entitlements.usage.activeRetentionActions) &&
    Number.isFinite(entitlements.limits.maxActiveRetentionActions);
  const isRecurringUnavailableOnCurrentPlan =
    hasReliableRecurringEntitlementData && recurringLimit.limitValue === 0;
  const isRecurringLimitReached =
    hasReliableRecurringEntitlementData &&
    recurringLimit.limitValue > 0 &&
    recurringLimit.isAtLimit;
  const isRecurringNearLimit =
    hasReliableRecurringEntitlementData &&
    recurringLimit.limitValue > 0 &&
    recurringLimit.isNearLimit;
  const isAiUnavailableOnCurrentPlan =
    !isEntitlementsLoading && aiExecutionsLimit.limitValue === 0;
  const isAiQuotaReached =
    !isEntitlementsLoading &&
    aiExecutionsLimit.limitValue > 0 &&
    aiExecutionsLimit.isAtLimit;
  const isStarterCampaignLimitFilledByReferral =
    entitlements?.plan === 'starter' &&
    campaignLimit.limitValue === 1 &&
    campaignLimit.isAtLimit &&
    isReferralCampaignActive;
  const campaignLimitReachedCopy = isStarterCampaignLimitFilledByReferral
    ? 'ב-Starter יש מקום אחד במכסת הקמפיינים. קמפיין ההפניות פעיל כברירת מחדל ומשתמש במקום הזה; אפשר לכבות אותו במסך ההפניות או לשדרג.'
    : 'הגעתם למכסה הפעילה. המכסה כוללת קמפיינים ידניים וקמפיין הפניות פעיל; אפשר לארכב קמפיין קיים או לשדרג כדי לפתוח מקום נוסף.';
  const canCreateCampaign =
    Boolean(activeBusinessId) &&
    canViewCampaigns &&
    canCreateCampaigns &&
    !isEntitlementsLoading &&
    !campaignLimit.isAtLimit;

  const openCampaignEditor = (campaignId: Id<'campaigns'>) => {
    if (!activeBusinessId) {
      return;
    }
    router.push({
      pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
      params: {
        campaignId: String(campaignId),
        businessId: String(activeBusinessId),
      },
    });
  };

  const openCampaignsUpgrade = (
    requiredPlan:
      | 'starter'
      | 'pro'
      | 'premium'
      | null = requiredPlanForCampaigns
  ) => {
    openSubscriptionComparison(router, {
      featureKey: 'maxCampaigns',
      requiredPlan,
      reason: 'limit_reached',
    });
  };

  const openRecurringUpgrade = (
    requiredPlan:
      | 'starter'
      | 'pro'
      | 'premium'
      | null = requiredPlanForRecurring,
    reason: 'feature_locked' | 'limit_reached' = 'limit_reached'
  ) => {
    openSubscriptionComparison(router, {
      featureKey: 'maxActiveRetentionActions',
      requiredPlan,
      reason,
    });
  };

  const handleRestoreCampaign = async (campaignId: Id<'campaigns'>) => {
    if (!activeBusinessId || !canEditCampaigns || busyCampaignId) {
      return;
    }
    setBusyCampaignId(String(campaignId));
    try {
      await restoreManagementCampaign({
        businessId: activeBusinessId,
        campaignId,
      });
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'מגבלת מסלול',
          entitlementErrorToHebrewMessage(entitlementError)
        );
        openCampaignsUpgrade(
          entitlementError.requiredPlan ?? requiredPlanForCampaigns
        );
        return;
      }
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'שחזור קמפיין נכשל.'
      );
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleCreateCampaign = () => {
    if (!activeBusinessId || !canCreateCampaigns) {
      return;
    }
    if (campaignLimit.isAtLimit) {
      openCampaignsUpgrade();
      return;
    }
    router.push({
      pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
      params: {
        campaignId: 'new',
        businessId: String(activeBusinessId),
      },
    });
  };

  const renderCampaignCard = (campaign: ManagementCampaign) => {
    const isLiveCampaign = campaign.lifecycle === 'active';
    const typeMeta = campaignTypeMeta(campaign.type);
    const campaignProgram =
      campaign.programId != null
        ? (programNameById.get(String(campaign.programId)) ?? 'תוכנית לא זמינה')
        : 'כל העסק';

    return (
      <View
        key={String(campaign.campaignId)}
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
      >
        <View className={`${tw.flexRow} items-center justify-between gap-3`}>
          <View className={`${tw.flexRow} flex-1 items-center gap-3`}>
            <View
              className={`h-11 w-11 items-center justify-center rounded-xl ${typeMeta.iconBgClass}`}
            >
              <Ionicons
                name={typeMeta.icon}
                size={20}
                color={typeMeta.iconColor}
              />
            </View>
            <View className={`flex-1 ${tw.itemsStart}`}>
              <Text
                className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                {campaign.title}
              </Text>
              <Text
                className={`mt-0.5 text-xs font-semibold ${tw.textStart}`}
                style={{ color: typeMeta.iconColor }}
              >
                {typeMeta.label}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => openCampaignEditor(campaign.campaignId)}
            className={`rounded-full px-3 py-1.5 ${
              isLiveCampaign ? 'bg-[#16A34A]' : 'bg-[#E2E8F0]'
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                isLiveCampaign ? 'text-white' : 'text-[#475569]'
              }`}
            >
              {isLiveCampaign ? 'פעיל' : 'לא פעיל'}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => openCampaignEditor(campaign.campaignId)}
          className="mt-3 gap-1"
        >
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            סוג: {typeMeta.label} • אוטומציה:{' '}
            {campaign.automationEnabled ? 'פעילה' : 'כבויה'}
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            שיוך: {campaignProgram}
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            קהל מוערך: {formatNumber(campaign.estimatedAudience)} • הודעות
            שנשלחו: {formatNumber(campaign.reachedMessagesAllTime)}
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            שליחה אחרונה: {formatDateTime(campaign.lastSentAt)}
          </Text>
        </TouchableOpacity>
        <View className={`${tw.flexRow} mt-3 gap-2`}>
          <TouchableOpacity
            onPress={() => openCampaignEditor(campaign.campaignId)}
            className="rounded-xl border border-[#BFDBFE] bg-white px-3 py-2"
          >
            <Text className="text-xs font-bold text-[#1D4ED8]">פתיחה</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
            title="קמפיינים"
            subtitle="קמפיינים לפי מכסת המסלול, עם AI מ-Pro"
          />
        </StickyScrollHeader>

        <TouchableOpacity
          disabled={!canCreateCampaign}
          onPress={handleCreateCampaign}
          className={`mt-4 rounded-3xl px-4 py-4 ${
            canCreateCampaign ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
          }`}
        >
          <View className={`${tw.flexRow} items-center justify-center gap-2`}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text className="text-sm font-black text-white">צור קמפיין</Text>
          </View>
        </TouchableOpacity>

        {!isEntitlementsLoading ? (
          <View className="mt-4 rounded-3xl border border-[#DCE7F8] bg-white p-5">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              איך השיווק זמין במסלול שלכם
            </Text>
            <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
              מכסת הקמפיינים כוללת קמפיינים ידניים וגם קמפיין הפניות פעיל.
              המלצות ופעולות AI מתחילות מ-Pro, וב-Starter יש 0 פעולות AI.
            </Text>
            <View style={styles.accessGrid}>
              <MarketingAccessTile
                eyebrow="מכסת קמפיינים"
                title={`${campaignLimit.currentValue}/${campaignLimit.limitValue} פעילים במסלול ${currentPlanLabel ?? ''}`.trim()}
                body={
                  campaignLimit.isAtLimit
                    ? campaignLimitReachedCopy
                    : `אפשר ליצור ולנהל קמפיינים ידניים כל עוד נשאר מקום במכסה אחרי קמפיין הפניות פעיל, אם הוא מופעל. נותרו ${formatNumber(campaignLimit.remaining)} מקומות פעילים.`
                }
                accentColor="#1D4ED8"
                accentBg="#DBEAFE"
              />
              <MarketingAccessTile
                eyebrow="AI לקמפיינים"
                title={
                  isAiUnavailableOnCurrentPlan
                    ? 'לא זמין במסלול הנוכחי'
                    : `${aiExecutionsLimit.currentValue}/${aiExecutionsLimit.limitValue} פעולות AI החודש`
                }
                body={
                  isAiUnavailableOnCurrentPlan
                    ? 'AI לקמפיינים מתחיל מ-Pro. במסלול הנוכחי אין פעולות AI, אבל קמפיינים נשארים זמינים לפי המכסה.'
                    : isAiQuotaReached
                      ? 'נוצלה כל מכסת ה-AI החודשית. קמפיינים עדיין זמינים לפי מכסת המסלול.'
                      : 'המלצות, ניסוחים ופעולות AI משתמשים במכסה החודשית של המסלול, בלי להשפיע על זמינות הקמפיינים.'
                }
                accentColor="#7C3AED"
                accentBg="#EDE9FE"
              />
            </View>
          </View>
        ) : null}

        {isAiUnavailableOnCurrentPlan ? (
          <View className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Text
              className={`text-sm font-black text-blue-900 ${tw.textStart}`}
            >
              AI לקמפיינים מתחיל מ-Pro
            </Text>
            <Text
              className={`mt-1 text-xs font-semibold text-blue-700 ${tw.textStart}`}
            >
              {aiQuotaCopy.lockedSubtitle}
            </Text>
            <TouchableOpacity
              onPress={() =>
                openSubscriptionComparison(router, {
                  featureKey: 'maxAiExecutionsPerMonth',
                  requiredPlan: requiredPlanForAi,
                  reason: 'feature_locked',
                })
              }
              className="mt-3 self-end rounded-full bg-[#1D4ED8] px-3 py-1.5"
            >
              <Text className="text-xs font-black text-white">שדרוג</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {isAiQuotaReached ? (
          <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Text
              className={`text-sm font-black text-amber-900 ${tw.textStart}`}
            >
              {aiQuotaCopy.lockedTitle}
            </Text>
            <Text
              className={`mt-1 text-xs font-semibold text-amber-700 ${tw.textStart}`}
            >
              {aiQuotaCopy.lockedSubtitle}
            </Text>
            <TouchableOpacity
              onPress={() =>
                openSubscriptionComparison(router, {
                  featureKey: 'maxAiExecutionsPerMonth',
                  requiredPlan: requiredPlanForAi,
                  reason: 'limit_reached',
                })
              }
              className="mt-3 self-end rounded-full bg-[#B45309] px-3 py-1.5"
            >
              <Text className="text-xs font-black text-white">שדרוג</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isEntitlementsLoading ? (
          <View className="mt-4 rounded-2xl border border-[#DCE7F8] bg-white px-4 py-3">
            <View
              className={`${tw.flexRow} items-center justify-between gap-2`}
            >
              <Text
                className={`flex-1 text-xs font-bold text-[#1A2B4A] ${tw.textStart}`}
              >
                קמפיינים אוטומטיים / חוזרים
              </Text>
              {hasReliableRecurringEntitlementData ? (
                <Text className="text-xs font-black text-[#0F766E]">
                  {`${formatNumber(recurringLimit.currentValue)}/${formatNumber(recurringLimit.limitValue)}`}
                </Text>
              ) : null}
            </View>
            <Text className={`mt-2 text-xs text-[#475569] ${tw.textStart}`}>
              {isRecurringUnavailableOnCurrentPlan
                ? 'המסלול הנוכחי לא כולל קמפיינים אוטומטיים. קמפיינים חוזרים זמינים החל ממסלול Pro.'
                : hasReliableRecurringEntitlementData
                  ? `כרגע פעילים ${formatNumber(recurringLimit.currentValue)} מתוך ${formatNumber(recurringLimit.limitValue)} קמפיינים אוטומטיים במסלול ${currentPlanLabel ?? ''}.`.trim()
                  : 'השימוש בקמפיינים אוטומטיים יוצג כאן ברגע שנתוני המסלול יהיו זמינים.'}
            </Text>
            {hasReliableRecurringEntitlementData &&
            recurringLimit.limitValue > 0 ? (
              <View className="mt-3">
                <UsageProgressBar
                  label="שימוש במכסת קמפיינים אוטומטיים"
                  used={recurringLimit.currentValue}
                  limit={recurringLimit.limitValue}
                  accent={DASHBOARD_TOKENS.colors.teal}
                />
              </View>
            ) : null}
            {isRecurringUnavailableOnCurrentPlan ? (
              <View
                className={`${tw.flexRow} mt-3 items-center justify-between gap-3`}
              >
                <Text
                  className={`flex-1 text-xs text-[#1D4ED8] ${tw.textStart}`}
                >
                  {recurringQuotaCopy.lockedSubtitle}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    openRecurringUpgrade(
                      requiredPlanForRecurring,
                      'feature_locked'
                    )
                  }
                  className="rounded-full bg-[#1D4ED8] px-3 py-1.5"
                >
                  <Text className="text-xs font-black text-white">שדרוג</Text>
                </TouchableOpacity>
              </View>
            ) : isRecurringLimitReached ? (
              <View
                className={`${tw.flexRow} mt-3 items-center justify-between gap-3`}
              >
                <Text
                  className={`flex-1 text-xs text-[#B45309] ${tw.textStart}`}
                >
                  {recurringQuotaCopy.lockedSubtitle}
                </Text>
                <TouchableOpacity
                  onPress={() => openRecurringUpgrade()}
                  className="rounded-full bg-[#B45309] px-3 py-1.5"
                >
                  <Text className="text-xs font-black text-white">שדרוג</Text>
                </TouchableOpacity>
              </View>
            ) : isRecurringNearLimit ? (
              <Text className={`mt-3 text-xs text-[#B45309] ${tw.textStart}`}>
                {`נשארו עוד ${formatNumber(recurringLimit.remaining)} מקומות לקמפיינים אוטומטיים במסלול הנוכחי.`}
              </Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() =>
            router.push(
              '/(authenticated)/(business)/settings-business-referrals'
            )
          }
          className="mt-4 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
        >
          <View className={`${tw.flexRow} items-center justify-between gap-3`}>
            <View className={`${tw.flexRow} flex-1 items-center gap-3`}>
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-[#DCFCE7]">
                <Ionicons name="people-outline" size={20} color="#15803D" />
              </View>
              <View className={`flex-1 ${tw.itemsStart}`}>
                <Text
                  className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                >
                  חבר מביא חבר
                </Text>
                <Text
                  className={`mt-0.5 text-xs font-semibold ${tw.textStart}`}
                  style={{ color: '#15803D' }}
                >
                  תבנית קמפיין מוכנה
                </Text>
              </View>
            </View>
            <View
              className={`rounded-full px-3 py-1.5 ${isReferralCampaignActive && !isReferralConfigLoading ? 'bg-[#16A34A]' : 'bg-[#E2E8F0]'}`}
            >
              <Text
                className={`text-xs font-extrabold ${isReferralCampaignActive && !isReferralConfigLoading ? 'text-white' : 'text-[#475569]'}`}
              >
                {referralCampaignBadgeLabel}
              </Text>
            </View>
          </View>
          <Text className={`mt-3 text-xs text-[#64748B] ${tw.textStart}`}>
            קמפיין ההפניות פעיל כברירת מחדל כשאין הגדרה שמורה. כשהוא פעיל הוא
            נספר כמקום אחד במכסת הקמפיינים.
          </Text>
        </TouchableOpacity>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCell}>
            <KpiCard
              label="קמפיינים פעילים"
              value={formatNumber(liveCampaigns.length)}
              icon="megaphone-outline"
              tone="blue"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="אוטומציות פעילות"
              value={formatNumber(automatedCampaignsCount)}
              icon="flash-outline"
              tone="emerald"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="הודעות שנשלחו"
              value={formatNumber(totalMessagesSent)}
              icon="mail-open-outline"
              tone="teal"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="לא פעילים"
              value={formatNumber(inactiveCampaigns.length)}
              icon="pause-circle-outline"
              tone="amber"
            />
          </View>
        </View>

        {!isEntitlementsLoading ? (
          <View className="mt-3 rounded-2xl border border-[#DCE7F8] bg-white px-4 py-3">
            <View
              className={`${tw.flexRow} items-center justify-between gap-2`}
            >
              <Text
                className={`text-xs font-bold text-[#1A2B4A] ${tw.textStart}`}
              >
                {'מכסת קמפיינים פעילים'}
              </Text>
              <Text className="text-xs font-black text-[#1D4ED8]">
                {`${campaignLimit.currentValue}/${campaignLimit.limitValue}`}
              </Text>
            </View>
            {campaignLimit.isAtLimit ? (
              <View
                className={`${tw.flexRow} mt-2 items-center justify-between gap-3`}
              >
                <Text
                  className={`flex-1 text-xs text-[#B45309] ${tw.textStart}`}
                >
                  {campaignLimitReachedCopy}
                </Text>
                <TouchableOpacity
                  onPress={() => openCampaignsUpgrade()}
                  className="rounded-full bg-[#1D4ED8] px-3 py-1.5"
                >
                  <Text className="text-xs font-black text-white">
                    {'שדרוג'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : campaignLimit.isNearLimit ? (
              <Text className={`mt-2 text-xs text-[#475569] ${tw.textStart}`}>
                {'מתקרבים למכסה הפעילה של הקמפיינים במסלול הנוכחי.'}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            סטטיסטיקת קמפיינים
          </Text>
          <View style={styles.usageStrip}>
            <PlanUsageTile
              label="קמפיינים"
              value={formatNumber(liveCampaigns.length)}
              hint="פעילים"
            />
            <PlanUsageTile
              label="אוטומציה"
              value={formatNumber(automatedCampaignsCount)}
              hint="פעילה"
            />
            <PlanUsageTile
              label="הודעות"
              value={formatNumber(totalMessagesSent)}
              hint='סה"כ'
            />
          </View>
        </View>

        <View style={styles.analyticsStack}>
          <HorizontalRankingChart
            title="דירוג קמפיינים לפי Reach"
            subtitle="מבוסס על הודעות שנשלחו בפועל"
            data={topReachCampaigns}
            color={DASHBOARD_TOKENS.colors.teal}
          />
          <InsightCard
            title="תובנת קמפיינים"
            body={
              bestReachCampaign
                ? `הקמפיין המוביל כרגע הוא "${bestReachCampaign.label}" עם ${formatNumber(
                    bestReachCampaign.value
                  )} הודעות שנשלחו.`
                : 'עדיין אין נתוני Reach מספיקים לקמפיינים פעילים.'
            }
            tags={[
              `פעילים: ${formatNumber(liveCampaigns.length)}`,
              `לא פעילים: ${formatNumber(inactiveCampaigns.length)}`,
              `בארכיון: ${formatNumber(archivedCampaigns.length)}`,
            ]}
          />
          <View style={styles.limitWrap}>
            <UsageProgressBar
              label="שימוש במכסת קמפיינים"
              used={campaignLimit.currentValue}
              limit={campaignLimit.limitValue}
              accent={DASHBOARD_TOKENS.colors.brandBlue}
            />
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            קמפיינים פעילים ({liveCampaigns.length})
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            העברה לארכיון זמינה רק מתוך דף עריכת הקמפיין.
          </Text>
          {campaignsQuery === undefined ? (
            <View className="py-4">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : liveCampaigns.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              אין קמפיינים פעילים. לחצו על "צור קמפיין" כדי להתחיל.
            </Text>
          ) : (
            liveCampaigns.map((campaign) => renderCampaignCard(campaign))
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <TouchableOpacity
            onPress={() => setIsInactiveExpanded((current) => !current)}
            className={`${tw.flexRow} items-center justify-between`}
          >
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              קמפיינים לא פעילים ({inactiveCampaigns.length})
            </Text>
            <Ionicons
              name={isInactiveExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#64748B"
            />
          </TouchableOpacity>

          {isInactiveExpanded ? (
            <View className="mt-3 gap-3">
              {campaignsQuery === undefined ? (
                <View className="py-4">
                  <ActivityIndicator color="#2F6BFF" />
                </View>
              ) : inactiveCampaigns.length === 0 ? (
                <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                  אין כרגע קמפיינים לא פעילים.
                </Text>
              ) : (
                inactiveCampaigns.map((campaign) =>
                  renderCampaignCard(campaign)
                )
              )}
            </View>
          ) : null}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <TouchableOpacity
            onPress={() => setIsArchivedExpanded((current) => !current)}
            className={`${tw.flexRow} items-center justify-between`}
          >
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              קמפיינים בארכיון ({archivedCampaigns.length})
            </Text>
            <Ionicons
              name={isArchivedExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#64748B"
            />
          </TouchableOpacity>

          {isArchivedExpanded ? (
            <View className="mt-3 gap-3">
              {archivedCampaigns.length === 0 ? (
                <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                  אין קמפיינים בארכיון.
                </Text>
              ) : (
                archivedCampaigns.map((campaign) => {
                  const isBusy = busyCampaignId === String(campaign.campaignId);
                  const typeMeta = campaignTypeMeta(campaign.type);
                  return (
                    <View
                      key={String(campaign.campaignId)}
                      className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
                    >
                      <Text
                        className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {campaign.title}
                      </Text>
                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        {typeMeta.label} • בארכיון מאז{' '}
                        {formatDateTime(campaign.archivedAt)}
                      </Text>
                      <View className={`${tw.flexRow} mt-3 gap-2`}>
                        <TouchableOpacity
                          disabled={!canEditCampaigns || isBusy}
                          onPress={() => {
                            void handleRestoreCampaign(campaign.campaignId);
                          }}
                          className={`rounded-xl px-3 py-2 ${
                            !canEditCampaigns || isBusy
                              ? 'bg-[#CBD5E1]'
                              : 'bg-[#0F766E]'
                          }`}
                        >
                          {isBusy ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text className="text-xs font-bold text-white">
                              שחזור
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function CampaignsHubRoute() {
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(authenticated)/(business)/campaigns',
        params: {
          ...(preview ? { preview } : {}),
          ...(map ? { map } : {}),
        },
      }}
    />
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    marginTop: 16,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCell: {
    width: '48%',
  },
  analyticsStack: {
    marginTop: 16,
    gap: 14,
  },
  limitWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  usageStrip: {
    marginTop: 12,
    flexDirection: flexDirection.row,
    gap: 8,
  },
  accessGrid: {
    marginTop: 12,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 10,
  },
  accessTile: {
    width: '48%',
    minHeight: 128,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: alignItems.start,
    gap: 6,
  },
  accessTileEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: TEXT_START,
  },
  accessTileTitle: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  accessTileBody: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: TEXT_START,
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
    alignItems: alignItems.start,
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
});
