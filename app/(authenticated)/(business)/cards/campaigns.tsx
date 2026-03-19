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
import { BackButton } from '@/components/BackButton';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { IS_RTL, tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type ManagementCampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';
type MarketingTopTab = 'campaigns' | 'loyalty';
const TEXT_START = IS_RTL ? 'right' : 'left';
const TEXT_END = IS_RTL ? 'left' : 'right';
const ROW_DIRECTION = IS_RTL ? 'row-reverse' : 'row';

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

const TOP_TABS: Array<{ key: MarketingTopTab; label: string }> = [
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
  const canManage =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';
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
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const campaignsQuery = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
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
  const campaignLimit = limitStatus('maxCampaigns', activeCampaigns.length);
  const requiredPlanForCampaigns =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCampaigns ?? 'pro';
  const canCreateCampaign =
    Boolean(activeBusinessId) &&
    canManage &&
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

  const handleRestoreCampaign = async (campaignId: Id<'campaigns'>) => {
    if (!activeBusinessId || !canManage || busyCampaignId) {
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
    if (!activeBusinessId || !canManage) {
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
            <View className="flex-1 items-end">
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
            subtitle="ניהול קמפיינים קלאסיים לעסק"
            titleAccessory={<BackButton onPress={() => router.replace('/(authenticated)/(business)/dashboard')} />}
          />
        </StickyScrollHeader>

        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {TOP_TABS.map((topTab) => {
            const isActive = topTab.key === 'campaigns';
            return (
              <TouchableOpacity
                key={topTab.key}
                onPress={() => {
                  if (topTab.key === 'campaigns') {
                    return;
                  }
                  router.setParams({ section: 'loyalty' });
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
                  {
                    'הגעתם למכסה הפעילה. אפשר להעביר קמפיין קיים לארכיון או לשדרג מסלול.'
                  }
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
                          disabled={!canManage || isBusy}
                          onPress={() => {
                            void handleRestoreCampaign(campaign.campaignId);
                          }}
                          className={`rounded-xl px-3 py-2 ${
                            !canManage || isBusy
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
        pathname: '/(authenticated)/(business)/cards',
        params: { preview, map, section: 'campaigns' },
      }}
    />
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
});
