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
import {
  CampaignManagementCard,
  type CampaignManagementType,
} from '@/components/campaigns/CampaignManagementCard';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import { ManagementUsageSummary } from '@/components/management';
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

type ManagementCampaign = {
  campaignId: Id<'campaigns'>;
  businessId: Id<'businesses'>;
  programId: Id<'loyaltyPrograms'> | null;
  type: CampaignManagementType;
  title: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  automationEnabled: boolean;
  isCountedTowardLimit: boolean;
  scheduleMode: 'send_now' | 'one_time' | 'recurring' | null;
  scheduledForAt: number | null;
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
  const customerReferralQuotaCount = referralConsumesCampaignSlot ? 1 : 0;
  const managementCampaignQuotaCount = Math.max(
    0,
    campaignLimit.currentValue - customerReferralQuotaCount
  );
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
  const createBlockedReason = !activeBusinessId
    ? 'יש לבחור עסק פעיל.'
    : !canCreateCampaigns
      ? 'אין לך הרשאה ליצור קמפיינים.'
      : isEntitlementsLoading || isReferralConfigLoading
        ? 'בודקים את מגבלת המסלול…'
        : campaignLimit.isAtLimit
          ? 'יצירה חסומה עד לארכוב קמפיין או לשדרוג המסלול.'
          : null;

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
    return (
      <CampaignManagementCard
        key={String(campaign.campaignId)}
        type={campaign.type}
        title={campaign.title}
        lifecycle={campaign.lifecycle}
        audienceCount={campaign.estimatedAudience}
        timingLabel={
          campaign.scheduleMode === 'one_time' && campaign.scheduledForAt
            ? `מתוזמן ל-${formatDateTime(campaign.scheduledForAt)}`
            : campaign.automationEnabled
              ? 'שליחה אוטומטית'
              : `שליחה אחרונה: ${formatDateTime(campaign.lastSentAt)}`
        }
        onPress={() => openCampaignEditor(campaign.campaignId)}
      />
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
            className={`mt-4 ${tw.selfStart} min-h-[46px] min-w-[148px] rounded-2xl px-4 py-3 ${
              canCreateCampaign
                ? 'bg-[#2F6BFF]'
                : 'border border-[#CBD5E1] bg-[#E2E8F0]'
            }`}
          >
            <View className={`${tw.flexRow} items-center justify-center gap-2`}>
              <Ionicons
                name={canCreateCampaign ? 'add' : 'lock-closed-outline'}
                size={19}
                color={canCreateCampaign ? '#FFFFFF' : '#475569'}
              />
              <Text
                className={`text-sm font-black ${
                  canCreateCampaign ? 'text-white' : 'text-[#334155]'
                }`}
              >
                צור קמפיין
              </Text>
            </View>
          </TouchableOpacity>
          {!canCreateCampaign && createBlockedReason ? (
            <Text
              className={`mt-2 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
            >
              {createBlockedReason}
            </Text>
          ) : null}
        </View>

        {!isEntitlementsLoading && !isReferralConfigLoading ? (
          <View className="mt-4 gap-2">
            <ManagementUsageSummary
              label="הגדרות קמפיין בשימוש"
              used={campaignLimit.currentValue}
              limit={campaignLimit.limitValue}
              unit="הגדרות"
              nearLimitText="מתקרבים למכסת הקמפיינים במסלול הנוכחי."
              atLimitText={campaignLimitReachedCopy}
              overLimitText="הקמפיינים הקיימים נשמרו. יצירה או הפעלה נוספת חסומה עד לארכוב קמפיין או לשדרוג המסלול."
              actionLabel={campaignLimit.isAtLimit ? 'שדרוג' : undefined}
              onActionPress={campaignLimit.isAtLimit ? openCampaignsUpgrade : undefined}
            />
            <View className="rounded-2xl border border-[#D7E2F4] bg-white px-3 py-2.5">
              <Text className={`text-xs text-[#475569] ${tw.textStart}`}>
                {managementCampaignQuotaCount} קמפיינים
                {customerReferralQuotaCount > 0
                  ? ' + הפניית לקוחות אחת (C2C)'
                  : ''}
              </Text>
              <Text className={`mt-1 text-[11px] text-[#64748B] ${tw.textStart}`}>
                הזמנת עסקים ל-StampAix (B2B) מנוהלת בנפרד ואינה נספרת במכסה הזו.
              </Text>
              {referralConsumesCampaignSlot ? (
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      '/(authenticated)/(business)/settings-business-referrals'
                    )
                  }
                  className={`${tw.selfStart} mt-2 min-h-[40px] items-center justify-center rounded-xl border border-[#BFDBFE] bg-[#F8FAFF] px-3`}
                  accessibilityRole="button"
                  accessibilityLabel="ניהול הפניית לקוחות"
                >
                  <Text className="text-xs font-black text-[#1D4ED8]">
                    ניהול הפניית לקוחות
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="mt-5 gap-3 border-t border-[#D7E2F4] pt-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            קמפיינים פעילים ({liveCampaigns.length})
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
                  return (
                    <View key={String(campaign.campaignId)} className="gap-2">
                      <CampaignManagementCard
                        type={campaign.type}
                        title={campaign.title}
                        lifecycle="archived"
                        timingLabel={`בארכיון מאז ${formatDateTime(
                          campaign.archivedAt
                        )}`}
                        audienceCount={campaign.estimatedAudience}
                        onPress={() => openCampaignEditor(campaign.campaignId)}
                      />
                      <View className={`${tw.flexRow} mt-3 gap-2`}>
                        <TouchableOpacity
                          disabled={!canEditCampaigns || isBusy}
                          onPress={() => {
                            void handleRestoreCampaign(campaign.campaignId);
                          }}
                          className={`min-h-[40px] rounded-xl border px-3 py-2 ${
                            !canEditCampaigns || isBusy
                              ? 'border-[#CBD5E1] bg-[#F1F5F9]'
                              : 'border-[#B8C8E8] bg-white'
                          }`}
                        >
                          {isBusy ? (
                            <ActivityIndicator color="#1D4ED8" size="small" />
                          ) : (
                            <Text className="text-xs font-bold text-[#1D4ED8]">
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
