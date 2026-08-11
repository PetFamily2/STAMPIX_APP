import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type ManagementCampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';
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
        label: 'קמפיין כללי',
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

export function CampaignsHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const guideTargetRef = useGuidedTargetRef();
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

  const restoreManagementCampaign = useMutation(
    api.campaigns.restoreManagementCampaign
  );

  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [isInactiveExpanded, setIsInactiveExpanded] = useState(false);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);

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
  const campaignLimit = limitStatus('maxCampaigns');
  const isReferralConfigLoading = referralConfig === undefined;
  const referralConsumesCampaignSlot =
    !isReferralConfigLoading && referralConfig?.isEnabled !== false;
  const requiredPlanForCampaigns =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCampaigns ?? 'pro';
  const campaignLimitReachedCopy = referralConsumesCampaignSlot
    ? activeCampaigns.length === 0
      ? 'המכסה מלאה על ידי פעילות ההפניות. אפשר לנהל אותה או לשדרג מסלול.'
      : 'הגעתם למכסה הפעילה. אפשר לארכב קמפיין, לנהל את פעילות ההפניות או לשדרג מסלול.'
    : 'הגעתם למכסה הפעילה. אפשר לארכב קמפיין קיים או לשדרג מסלול כדי לפתוח מקום נוסף.';
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
      Alert.alert('שגיאה', 'שחזור קמפיין נכשל.');
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

    return (
      <TouchableOpacity
        key={String(campaign.campaignId)}
        onPress={() => openCampaignEditor(campaign.campaignId)}
        className={`${tw.flexRow} min-h-[72px] items-center gap-3 border-b border-[#D7E2F4] py-4`}
        accessibilityRole="button"
        accessibilityLabel={`פתיחת הקמפיין ${campaign.title}`}
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-xl ${typeMeta.iconBgClass}`}
        >
          <Ionicons name={typeMeta.icon} size={19} color={typeMeta.iconColor} />
        </View>
        <View className={`flex-1 ${tw.itemsStart}`}>
          <Text className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}>
            {campaign.title}
          </Text>
          <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
            {typeMeta.label} · שליחה אחרונה:{' '}
            {formatDateTime(campaign.lastSentAt)}
          </Text>
        </View>
        <View
          className={`rounded-full px-2.5 py-1 ${
            isLiveCampaign ? 'bg-[#DCFCE7]' : 'bg-[#E2E8F0]'
          }`}
        >
          <Text
            className={`text-[11px] font-extrabold ${
              isLiveCampaign ? 'text-[#15803D]' : 'text-[#475569]'
            }`}
          >
            {isLiveCampaign ? 'פעיל' : 'לא פעיל'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color="#64748B" />
      </TouchableOpacity>
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
          width: '100%',
          maxWidth: 960,
          alignSelf: 'center',
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="קמפיינים"
            subtitle="יצירה, תזמון וניהול קמפיינים"
          />
        </StickyScrollHeader>

        <View ref={guideTargetRef} collapsable={false}>
          <TouchableOpacity
            disabled={!canCreateCampaign}
            onPress={handleCreateCampaign}
            className={`mt-4 min-h-[52px] rounded-2xl px-4 py-3 ${
              canCreateCampaign ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
            }`}
          >
            <View className={`${tw.flexRow} items-center justify-center gap-2`}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text className="text-sm font-black text-white">צור קמפיין</Text>
            </View>
          </TouchableOpacity>
        </View>

        {!isEntitlementsLoading ? (
          <View className="mt-4 border-b border-[#D7E2F4] pb-4">
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
            {referralConsumesCampaignSlot ? (
              <View
                className={`${tw.flexRow} mt-2 items-center justify-between gap-3`}
              >
                <Text
                  className={`flex-1 text-xs text-[#475569] ${tw.textStart}`}
                >
                  פעילות &quot;חבר מביא חבר&quot; פעילה ומשתמשת במקום אחד
                  במכסת הקמפיינים.
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      '/(authenticated)/(business)/settings-business-referrals'
                    )
                  }
                  className="min-h-[44px] items-center justify-center rounded-xl border border-[#BFDBFE] bg-white px-3 py-2"
                  accessibilityRole="button"
                  accessibilityLabel="ניהול הפניות"
                >
                  <Text className="text-xs font-black text-[#1D4ED8]">
                    ניהול הפניות
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
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

        <View className="mt-5 gap-1 border-t border-[#D7E2F4] pt-4">
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
            <View className="gap-1">
              <Text
                className={`text-sm font-black text-[#0F172A] ${tw.textStart}`}
              >
                עדיין אין קמפיינים פעילים
              </Text>
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                מומלץ להתחיל מקמפיינים אחרי שיש לקוחות ראשונים בכרטיסייה.
              </Text>
            </View>
          ) : (
            liveCampaigns.map((campaign) => renderCampaignCard(campaign))
          )}
        </View>

        <View className="mt-5 border-t border-[#D7E2F4] pt-4">
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

        <View className="mt-5 border-t border-[#D7E2F4] pt-4">
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
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="campaigns"
        targetRef={guideTargetRef}
      />
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
