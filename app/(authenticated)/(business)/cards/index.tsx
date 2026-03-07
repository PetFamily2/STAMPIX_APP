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
import { CARD_THEMES } from '@/constants/cardThemes';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';
import { tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type ManagementTab = 'programs' | 'campaigns';
type CampaignTemplateType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';

const MANAGEMENT_TABS: Array<{ key: ManagementTab; label: string }> = [
  { key: 'programs', label: 'כרטיסיות' },
  { key: 'campaigns', label: 'קמפיינים' },
];

const CAMPAIGN_TEMPLATES: Array<{
  type: CampaignTemplateType;
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {
    type: 'welcome',
    title: 'Welcome',
    subtitle: 'לקוחות חדשים מהשבועיים האחרונים',
    icon: '👋',
  },
  {
    type: 'birthday',
    title: 'Birthday',
    subtitle: 'לקוחות עם יום הולדת היום',
    icon: '🎂',
  },
  {
    type: 'anniversary',
    title: 'Anniversary',
    subtitle: 'לקוחות עם יום נישואין היום',
    icon: '💍',
  },
  {
    type: 'winback',
    title: 'Winback',
    subtitle: 'לקוחות שלא הגיעו 30 יום',
    icon: '🔁',
  },
  {
    type: 'promo',
    title: 'Promo',
    subtitle: 'כל הלקוחות הפעילים',
    icon: '📣',
  },
];

function parseTab(value: unknown): ManagementTab {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === 'campaigns' ? 'campaigns' : 'programs';
}

function resolveCampaignLifecycle(campaign: {
  lifecycle?: string;
  isActive?: boolean;
  automationEnabled?: boolean;
}) {
  if (campaign.lifecycle) {
    return campaign.lifecycle;
  }
  if (campaign.isActive === false) {
    return 'archived' as const;
  }
  return campaign.automationEnabled === true
    ? ('active' as const)
    : ('inactive' as const);
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

function formatDate(value: number) {
  return new Date(value).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export default function BusinessCardsManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string | string[];
  }>();

  const {
    activeBusinessId,
    activeBusiness,
    businesses,
    isLoading: isLoadingBusinesses,
  } = useActiveBusiness();
  const [activeTab, setActiveTab] = useState<ManagementTab>(() =>
    parseTab(params.tab)
  );

  useEffect(() => {
    setActiveTab(parseTab(params.tab));
  }, [params.tab]);

  const canManagePrograms =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';

  const programsQuery = useQuery(
    api.loyaltyPrograms.listManagementByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const campaignsQuery = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );

  const programs = programsQuery ?? [];
  const campaigns = campaignsQuery ?? [];

  const createLoyaltyProgram = useMutation(
    api.loyaltyPrograms.createLoyaltyProgram
  );
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const createGeneralCampaignDraft = useMutation(
    api.campaigns.createGeneralCampaignDraft
  );
  const estimateCampaignAudience = useMutation(
    api.campaigns.estimateCampaignAudience
  );
  const sendCampaignNow = useMutation(api.campaigns.sendCampaignNow);
  const setCampaignAutomationEnabled = useMutation(
    api.campaigns.setCampaignAutomationEnabled
  );
  const archiveManagementCampaign = useMutation(
    api.campaigns.archiveManagementCampaign
  );
  const restoreManagementCampaign = useMutation(
    api.campaigns.restoreManagementCampaign
  );
  const { entitlements, limitStatus } = useEntitlements(activeBusinessId);

  const activePrograms = programs.filter(
    (program) => program.lifecycle === 'active'
  );
  const archivedPrograms = programs.filter(
    (program) => program.lifecycle === 'archived'
  );
  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const requiredPlanForCards =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCards ?? 'pro';

  const totalActiveCustomers = activePrograms.reduce(
    (sum, program) => sum + program.metrics.activeMembers,
    0
  );
  const totalRedemptions30d = programs.reduce(
    (sum, program) => sum + program.metrics.redemptions30d,
    0
  );

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [stampIcon, setStampIcon] = useState('star');
  const [cardThemeId, setCardThemeId] = useState(CARD_THEMES[0].id);
  const [isCreatingProgram, setIsCreatingProgram] = useState(false);
  const [isWorkingCampaignId, setIsWorkingCampaignId] = useState<string | null>(
    null
  );
  const [isTogglingCampaignId, setIsTogglingCampaignId] = useState<
    string | null
  >(null);
  const [isArchivingCampaignId, setIsArchivingCampaignId] = useState<
    string | null
  >(null);
  const [isRestoringCampaignId, setIsRestoringCampaignId] = useState<
    string | null
  >(null);
  const [isCreateCampaignModalVisible, setIsCreateCampaignModalVisible] =
    useState(false);
  const [isTemplateSelectorVisible, setIsTemplateSelectorVisible] =
    useState(false);
  const [isCreatingGeneralCampaign, setIsCreatingGeneralCampaign] =
    useState(false);

  const parsedMaxStamps = Number(maxStamps);
  const canCreateProgram =
    !!activeBusinessId &&
    canManagePrograms &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    stampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    !isCreatingProgram;

  const isProgramsLoading = !!activeBusinessId && programsQuery === undefined;
  const isCampaignsLoading = !!activeBusinessId && campaignsQuery === undefined;
  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => b.updatedAt - a.updatedAt),
    [campaigns]
  );
  const activeCampaigns = useMemo(
    () =>
      sortedCampaigns.filter(
        (campaign) => resolveCampaignLifecycle(campaign) === 'active'
      ),
    [sortedCampaigns]
  );
  const inactiveCampaigns = useMemo(
    () =>
      sortedCampaigns.filter(
        (campaign) => resolveCampaignLifecycle(campaign) === 'inactive'
      ),
    [sortedCampaigns]
  );
  const archivedCampaigns = useMemo(
    () =>
      sortedCampaigns.filter(
        (campaign) => resolveCampaignLifecycle(campaign) === 'archived'
      ),
    [sortedCampaigns]
  );

  const openUpgradeForCards = () => {
    openSubscriptionComparison(router, {
      featureKey: 'maxCards',
      requiredPlan: requiredPlanForCards,
      reason: 'limit_reached',
    });
  };

  const navigateToTab = (tab: ManagementTab) => {
    setActiveTab(tab);
    router.setParams({ tab });
  };

  const openCreateCampaignModal = () => {
    setIsTemplateSelectorVisible(false);
    setIsCreateCampaignModalVisible(true);
  };

  const closeCreateCampaignModal = () => {
    setIsCreateCampaignModalVisible(false);
    setIsTemplateSelectorVisible(false);
  };

  const handleCreateProgram = async () => {
    if (!activeBusinessId || !canCreateProgram) {
      return;
    }
    if (cardLimit.isAtLimit) {
      openUpgradeForCards();
      return;
    }

    setIsCreatingProgram(true);
    try {
      await createLoyaltyProgram({
        businessId: activeBusinessId,
        title: title.trim(),
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        stampIcon: stampIcon.trim(),
        cardThemeId,
      });
      setTitle('');
      setRewardName('');
      setMaxStamps('10');
      setStampIcon('star');
      Alert.alert('נשמר', 'כרטיסיה חדשה נוצרה בהצלחה.');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת כרטיסיה נכשלה.'
      );
    } finally {
      setIsCreatingProgram(false);
    }
  };

  const handleCreateTemplateCampaign = async (type: CampaignTemplateType) => {
    if (!activeBusinessId || !canManagePrograms) {
      return;
    }
    setIsWorkingCampaignId(`create-${type}`);
    try {
      const result = await createCampaignDraft({
        businessId: activeBusinessId,
        type,
      });
      closeCreateCampaignModal();
      router.push({
        pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
        params: {
          campaignId: result.campaignId,
          businessId: activeBusinessId,
        },
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת קמפיין נכשלה.'
      );
    } finally {
      setIsWorkingCampaignId(null);
    }
  };

  const handleCreateGeneralCampaign = async () => {
    if (!activeBusinessId || !canManagePrograms || isCreatingGeneralCampaign) {
      return;
    }

    setIsCreatingGeneralCampaign(true);
    try {
      const result = await createGeneralCampaignDraft({
        businessId: activeBusinessId,
      });
      closeCreateCampaignModal();
      router.push({
        pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
        params: {
          campaignId: result.campaignId,
          businessId: activeBusinessId,
        },
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת קמפיין נכשלה.'
      );
    } finally {
      setIsCreatingGeneralCampaign(false);
    }
  };

  const handleEditCampaign = (campaignId: Id<'campaigns'>) => {
    if (!activeBusinessId) {
      return;
    }
    router.push({
      pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
      params: {
        campaignId,
        businessId: activeBusinessId,
      },
    });
  };

  const handleSendCampaign = async (campaignId: Id<'campaigns'>) => {
    if (!activeBusinessId || !canManagePrograms) {
      return;
    }

    setIsWorkingCampaignId(String(campaignId));
    try {
      const estimate = await estimateCampaignAudience({
        businessId: activeBusinessId,
        campaignId,
      });

      if (estimate.total === 0) {
        Alert.alert('אין נמענים', 'לא נמצאו לקוחות זכאים (Opt-in) לקמפיין זה.');
        return;
      }

      Alert.alert(
        'אישור שליחה',
        `הקמפיין ישלח ל-${formatNumber(estimate.total)} לקוחות. להמשיך?`,
        [
          { text: 'ביטול', style: 'cancel' },
          {
            text: 'שלח עכשיו',
            style: 'default',
            onPress: () => {
              void (async () => {
                try {
                  const result = await sendCampaignNow({
                    businessId: activeBusinessId,
                    campaignId,
                  });
                  Alert.alert(
                    'נשלח',
                    `נשלחו ${formatNumber(result.sentCount)} הודעות. דולגו ${formatNumber(
                      result.skippedCount
                    )}.`
                  );
                } catch (error) {
                  Alert.alert(
                    'שגיאה',
                    error instanceof Error
                      ? error.message
                      : 'שליחת קמפיין נכשלה.'
                  );
                }
              })();
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא ניתן לחשב קהל יעד.'
      );
    } finally {
      setIsWorkingCampaignId(null);
    }
  };

  const handleToggleCampaignAutomation = async (
    campaignId: Id<'campaigns'>,
    automationEnabled: boolean
  ) => {
    if (!activeBusinessId || !canManagePrograms) {
      return;
    }

    setIsTogglingCampaignId(String(campaignId));
    try {
      await setCampaignAutomationEnabled({
        businessId: activeBusinessId,
        campaignId,
        enabled: !automationEnabled,
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא הצלחנו לעדכן מצב אוטומציה.'
      );
    } finally {
      setIsTogglingCampaignId(null);
    }
  };

  const handleArchiveCampaign = async (
    campaignId: Id<'campaigns'>,
    automationEnabled: boolean
  ) => {
    if (!activeBusinessId || !canManagePrograms) {
      return;
    }
    if (automationEnabled) {
      Alert.alert('לא ניתן לארכב', 'כבה אוטומציה כדי להעביר לארכיון.');
      return;
    }

    setIsArchivingCampaignId(String(campaignId));
    try {
      await archiveManagementCampaign({
        businessId: activeBusinessId,
        campaignId,
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא הצלחנו להעביר לארכיון.'
      );
    } finally {
      setIsArchivingCampaignId(null);
    }
  };

  const handleRestoreCampaign = async (campaignId: Id<'campaigns'>) => {
    if (!activeBusinessId || !canManagePrograms) {
      return;
    }

    setIsRestoringCampaignId(String(campaignId));
    try {
      await restoreManagementCampaign({
        businessId: activeBusinessId,
        campaignId,
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא הצלחנו לשחזר מהארכיון.'
      );
    } finally {
      setIsRestoringCampaignId(null);
    }
  };

  const summaryCards = [
    {
      id: 'active',
      label: 'כרטיסיות פעילות',
      value: formatNumber(activePrograms.length),
    },
    {
      id: 'archived',
      label: 'כרטיסיות בארכיון',
      value: formatNumber(archivedPrograms.length),
    },
    {
      id: 'customers',
      label: 'לקוחות פעילים',
      value: formatNumber(totalActiveCustomers),
    },
    {
      id: 'redeem',
      label: 'מימושים 30 יום',
      value: formatNumber(totalRedemptions30d),
    },
  ];

  if (isLoadingBusinesses) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF]">
        <ActivityIndicator color="#2F6BFF" />
      </SafeAreaView>
    );
  }

  if (businesses.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: 24,
          }}
        >
          <BusinessScreenHeader
            title="ניהול כרטיסיות"
            subtitle="כרטיסיות, קמפיינים ותובנות במקום אחד"
          />
          <View className="mt-6 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
            <Text
              className={`text-base font-extrabold text-[#1A2B4A] ${tw.textStart}`}
            >
              אין כרגע עסק מחובר לחשבון.
            </Text>
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              כדי לעבוד עם כרטיסיות וקמפיינים צריך להשלים onboarding עסקי.
            </Text>
            <TouchableOpacity
              onPress={() => router.push(BUSINESS_ONBOARDING_ROUTES.role)}
              className="rounded-2xl bg-[#2F6BFF] px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-white">
                מעבר ל-onboarding עסקי
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 30,
        }}
      >
        <BusinessScreenHeader
          title="ניהול כרטיסיות"
          subtitle="כרטיסיות, קמפיינים ופעולות במקום אחד"
          titleAccessory={
            <TouchableOpacity
              onPress={() =>
                router.replace('/(authenticated)/(business)/dashboard')
              }
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">{'<'}</Text>
            </TouchableOpacity>
          }
        />

        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {MANAGEMENT_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => navigateToTab(tab.key)}
                className={`flex-1 rounded-full py-2.5 ${
                  isActive ? 'bg-[#2F6BFF]' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-center text-sm font-extrabold ${
                    isActive ? 'text-white' : 'text-[#51617F]'
                  }`}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'programs' ? (
          <View className="mt-5 gap-4">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                תמונת מצב
              </Text>
              {isProgramsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : (
                <View className={`${tw.flexRow} flex-wrap gap-3`}>
                  {summaryCards.map((card) => (
                    <View
                      key={card.id}
                      className="w-[48.5%] rounded-2xl border border-[#DDE7FC] bg-[#F8FAFF] p-4"
                    >
                      <Text
                        className={`text-xs text-[#6F7E9A] ${tw.textStart}`}
                      >
                        {card.label}
                      </Text>
                      <Text
                        className={`mt-1 text-xl font-black text-[#13233F] ${tw.textStart}`}
                      >
                        {card.value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <LockedFeatureWrapper
              isLocked={cardLimit.isAtLimit}
              requiredPlan={requiredPlanForCards}
              onUpgradeClick={openUpgradeForCards}
              title="הגעתם למכסת הכרטיסים הפעילים"
              subtitle="כרטיסיה בארכיון לא נספרת במכסה, או שדרגו למסלול מתקדם."
            >
              <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
                <Text
                  className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
                >
                  יצירת כרטיסיה חדשה
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  editable={canManagePrograms}
                  placeholder="שם הכרטיסיה"
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
                <TextInput
                  value={rewardName}
                  onChangeText={setRewardName}
                  editable={canManagePrograms}
                  placeholder="הטבה ללקוח"
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
                <View className={`${tw.flexRow} gap-2`}>
                  <TextInput
                    value={maxStamps}
                    onChangeText={setMaxStamps}
                    editable={canManagePrograms}
                    keyboardType="number-pad"
                    placeholder="ניקובים"
                    placeholderTextColor="#94A3B8"
                    className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                  <TextInput
                    value={stampIcon}
                    onChangeText={setStampIcon}
                    editable={canManagePrograms}
                    placeholder="אייקון (star)"
                    placeholderTextColor="#94A3B8"
                    className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                </View>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  {CARD_THEMES.map((theme) => {
                    const selected = theme.id === cardThemeId;
                    return (
                      <TouchableOpacity
                        key={theme.id}
                        disabled={!canManagePrograms}
                        onPress={() => setCardThemeId(theme.id)}
                        className={`rounded-xl border px-3 py-2 ${
                          selected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text className="text-xs font-bold text-[#1A2B4A]">
                          {theme.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  disabled={!canCreateProgram}
                  onPress={() => {
                    void handleCreateProgram();
                  }}
                  className={`rounded-2xl px-4 py-3 ${canCreateProgram ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'}`}
                >
                  {isCreatingProgram ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-center text-sm font-bold text-white">
                      יצירת כרטיסיה
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </LockedFeatureWrapper>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                כרטיסיות פעילות
              </Text>
              {isProgramsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : activePrograms.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין עדיין כרטיסיות פעילות.
                </Text>
              ) : (
                activePrograms.map((program) => (
                  <TouchableOpacity
                    key={program.loyaltyProgramId}
                    onPress={() =>
                      router.push({
                        pathname:
                          '/(authenticated)/(business)/cards/[programId]',
                        params: {
                          programId: program.loyaltyProgramId,
                          businessId: activeBusinessId ?? '',
                        },
                      })
                    }
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
                  >
                    <View
                      className={`${tw.flexRow} items-center justify-between`}
                    >
                      <View className="rounded-full bg-[#EAF1FF] px-3 py-1">
                        <Text className="text-[11px] font-bold text-[#2756C5]">
                          פעילה
                        </Text>
                      </View>
                      <Text
                        className={`text-base font-black text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {program.title}
                      </Text>
                    </View>
                    <Text
                      className={`mt-1 text-xs text-[#62748B] ${tw.textStart}`}
                    >
                      הטבה: {program.rewardName} · ניקובים:{' '}
                      {formatNumber(program.maxStamps)}
                    </Text>
                    <Text
                      className={`mt-1 text-xs text-[#62748B] ${tw.textStart}`}
                    >
                      לקוחות פעילים:{' '}
                      {formatNumber(program.metrics.activeMembers)} · מימושים 30
                      יום: {formatNumber(program.metrics.redemptions30d)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                ארכיון כרטיסיות
              </Text>
              {isProgramsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : archivedPrograms.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין כרטיסיות בארכיון.
                </Text>
              ) : (
                archivedPrograms.map((program) => (
                  <TouchableOpacity
                    key={program.loyaltyProgramId}
                    onPress={() =>
                      router.push({
                        pathname:
                          '/(authenticated)/(business)/cards/[programId]',
                        params: {
                          programId: program.loyaltyProgramId,
                          businessId: activeBusinessId ?? '',
                        },
                      })
                    }
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F9FAFB] p-4"
                  >
                    <View
                      className={`${tw.flexRow} items-center justify-between`}
                    >
                      <View className="rounded-full bg-[#EEF2F7] px-3 py-1">
                        <Text className="text-[11px] font-bold text-[#64748B]">
                          ישנה
                        </Text>
                      </View>
                      <Text
                        className={`text-base font-black text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {program.title}
                      </Text>
                    </View>
                    <Text
                      className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                    >
                      לקוחות פעילים:{' '}
                      {formatNumber(program.metrics.activeMembers)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ) : (
          <View className="mt-5 gap-4">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                יצירת קמפיין חדש
              </Text>
              <TouchableOpacity
                disabled={!canManagePrograms}
                onPress={openCreateCampaignModal}
                className={`rounded-2xl px-4 py-3 ${
                  canManagePrograms ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                }`}
              >
                <Text className="text-center text-sm font-bold text-white">
                  + צור קמפיין חדש
                </Text>
              </TouchableOpacity>
              {!canManagePrograms ? (
                <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                  רק בעלים או מנהל יכולים ליצור ולנהל קמפיינים.
                </Text>
              ) : null}
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                קמפיינים פעילים ({activeCampaigns.length})
              </Text>
              {isCampaignsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : activeCampaigns.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין קמפיינים פעילים כרגע.
                </Text>
              ) : (
                activeCampaigns.map((campaign) => {
                  const isBusy =
                    isWorkingCampaignId === String(campaign.campaignId);
                  return (
                    <View
                      key={campaign.campaignId}
                      className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4 gap-2"
                    >
                      <View
                        className={`${tw.flexRow} items-center justify-between`}
                      >
                        <View
                          className={`rounded-full px-3 py-1 ${
                            campaign.status === 'sent'
                              ? 'bg-[#DCFCE7]'
                              : 'bg-[#EAF1FF]'
                          }`}
                        >
                          <Text
                            className={`text-[11px] font-bold ${
                              campaign.status === 'sent'
                                ? 'text-[#166534]'
                                : 'text-[#2756C5]'
                            }`}
                          >
                            {campaign.status === 'sent' ? 'נשלח' : 'טיוטה'}
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {campaign.title}
                        </Text>
                      </View>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        {campaign.messageTitle}
                      </Text>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        קהל משוער: {formatNumber(campaign.estimatedAudience)} ·
                        נוצר: {formatDate(campaign.createdAt)}
                      </Text>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        הגיע ל-{formatNumber(campaign.reachedUniqueAllTime)}{' '}
                        ייחודיים ·{' '}
                        {formatNumber(campaign.reachedMessagesAllTime)} הודעות
                      </Text>
                      {campaign.type === 'birthday' &&
                      typeof campaign.missingBirthdayCount === 'number' ? (
                        <Text
                          className={`text-xs text-[#62748B] ${tw.textStart}`}
                        >
                          חסר יום הולדת:{' '}
                          {formatNumber(campaign.missingBirthdayCount)}
                        </Text>
                      ) : null}
                      <View
                        className={`${tw.flexRow} items-center justify-between rounded-xl border border-[#D7E3FA] bg-white px-3 py-2`}
                      >
                        <Text
                          className={`text-xs font-semibold text-[#3E5279] ${tw.textStart}`}
                        >
                          אוטומטי יומי 09:00
                        </Text>
                        <TouchableOpacity
                          disabled={
                            !canManagePrograms ||
                            isTogglingCampaignId === String(campaign.campaignId)
                          }
                          onPress={() => {
                            void handleToggleCampaignAutomation(
                              campaign.campaignId,
                              campaign.automationEnabled === true
                            );
                          }}
                          className={`rounded-full px-3 py-1 ${
                            campaign.automationEnabled === true
                              ? 'bg-[#DCFCE7]'
                              : 'bg-[#E2E8F0]'
                          }`}
                        >
                          {isTogglingCampaignId ===
                          String(campaign.campaignId) ? (
                            <ActivityIndicator color="#1E293B" size="small" />
                          ) : (
                            <Text
                              className={`text-xs font-bold ${
                                campaign.automationEnabled === true
                                  ? 'text-[#166534]'
                                  : 'text-[#475569]'
                              }`}
                            >
                              {campaign.automationEnabled === true
                                ? 'פעיל'
                                : 'כבוי'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                      <Text
                        className={`text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        כבה אוטומציה כדי להעביר לארכיון.
                      </Text>
                      <View className={`${tw.flexRow} gap-2`}>
                        <TouchableOpacity
                          disabled={isBusy}
                          onPress={() =>
                            handleEditCampaign(campaign.campaignId)
                          }
                          className="flex-1 rounded-xl border border-[#2F6BFF] bg-white px-3 py-2"
                        >
                          <Text className="text-center text-xs font-bold text-[#2F6BFF]">
                            פרטים
                          </Text>
                        </TouchableOpacity>
                        {campaign.status === 'draft' ? (
                          <TouchableOpacity
                            disabled={!canManagePrograms || isBusy}
                            onPress={() => {
                              void handleSendCampaign(campaign.campaignId);
                            }}
                            className={`flex-1 rounded-xl px-3 py-2 ${
                              canManagePrograms && !isBusy
                                ? 'bg-[#2F6BFF]'
                                : 'bg-[#CBD5E1]'
                            }`}
                          >
                            {isBusy ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <Text className="text-center text-xs font-bold text-white">
                                שלח עכשיו
                              </Text>
                            )}
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          disabled={true}
                          onPress={() => {
                            void handleArchiveCampaign(
                              campaign.campaignId,
                              campaign.automationEnabled === true
                            );
                          }}
                          className="flex-1 rounded-xl bg-[#CBD5E1] px-3 py-2"
                        >
                          <Text className="text-center text-xs font-bold text-[#64748B]">
                            שלח לארכיון
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                קמפיינים לא פעילים ({inactiveCampaigns.length})
              </Text>
              {isCampaignsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : inactiveCampaigns.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין קמפיינים לא פעילים.
                </Text>
              ) : (
                inactiveCampaigns.map((campaign) => {
                  const isBusy =
                    isWorkingCampaignId === String(campaign.campaignId);
                  const isArchiving =
                    isArchivingCampaignId === String(campaign.campaignId);
                  const isToggling =
                    isTogglingCampaignId === String(campaign.campaignId);
                  const canArchive =
                    campaign.canArchive === true &&
                    campaign.automationEnabled !== true;

                  return (
                    <View
                      key={campaign.campaignId}
                      className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4 gap-2"
                    >
                      <View
                        className={`${tw.flexRow} items-center justify-between`}
                      >
                        <View className="rounded-full bg-[#EAF1FF] px-3 py-1">
                          <Text className="text-[11px] font-bold text-[#2756C5]">
                            לא פעיל
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {campaign.title}
                        </Text>
                      </View>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        {campaign.messageTitle}
                      </Text>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        קהל משוער: {formatNumber(campaign.estimatedAudience)} ·
                        נוצר: {formatDate(campaign.createdAt)}
                      </Text>
                      <View
                        className={`${tw.flexRow} items-center justify-between rounded-xl border border-[#D7E3FA] bg-white px-3 py-2`}
                      >
                        <Text
                          className={`text-xs font-semibold text-[#3E5279] ${tw.textStart}`}
                        >
                          אוטומטי יומי 09:00
                        </Text>
                        <TouchableOpacity
                          disabled={!canManagePrograms || isToggling}
                          onPress={() => {
                            void handleToggleCampaignAutomation(
                              campaign.campaignId,
                              campaign.automationEnabled === true
                            );
                          }}
                          className={`rounded-full px-3 py-1 ${
                            campaign.automationEnabled === true
                              ? 'bg-[#DCFCE7]'
                              : 'bg-[#E2E8F0]'
                          }`}
                        >
                          {isToggling ? (
                            <ActivityIndicator color="#1E293B" size="small" />
                          ) : (
                            <Text
                              className={`text-xs font-bold ${
                                campaign.automationEnabled === true
                                  ? 'text-[#166534]'
                                  : 'text-[#475569]'
                              }`}
                            >
                              {campaign.automationEnabled === true
                                ? 'פעיל'
                                : 'כבוי'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                      <View className={`${tw.flexRow} gap-2`}>
                        <TouchableOpacity
                          disabled={isBusy}
                          onPress={() =>
                            handleEditCampaign(campaign.campaignId)
                          }
                          className="flex-1 rounded-xl border border-[#2F6BFF] bg-white px-3 py-2"
                        >
                          <Text className="text-center text-xs font-bold text-[#2F6BFF]">
                            פרטים
                          </Text>
                        </TouchableOpacity>
                        {campaign.status === 'draft' ? (
                          <TouchableOpacity
                            disabled={!canManagePrograms || isBusy}
                            onPress={() => {
                              void handleSendCampaign(campaign.campaignId);
                            }}
                            className={`flex-1 rounded-xl px-3 py-2 ${
                              canManagePrograms && !isBusy
                                ? 'bg-[#2F6BFF]'
                                : 'bg-[#CBD5E1]'
                            }`}
                          >
                            {isBusy ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <Text className="text-center text-xs font-bold text-white">
                                שלח עכשיו
                              </Text>
                            )}
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          disabled={
                            !canManagePrograms || !canArchive || isArchiving
                          }
                          onPress={() => {
                            void handleArchiveCampaign(
                              campaign.campaignId,
                              campaign.automationEnabled === true
                            );
                          }}
                          className={`flex-1 rounded-xl px-3 py-2 ${
                            canManagePrograms && canArchive && !isArchiving
                              ? 'bg-[#0F766E]'
                              : 'bg-[#CBD5E1]'
                          }`}
                        >
                          {isArchiving ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <Text className="text-center text-xs font-bold text-white">
                              שלח לארכיון
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                ארכיון קמפיינים ({archivedCampaigns.length})
              </Text>
              {isCampaignsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : archivedCampaigns.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין קמפיינים בארכיון.
                </Text>
              ) : (
                archivedCampaigns.map((campaign) => {
                  const isRestoring =
                    isRestoringCampaignId === String(campaign.campaignId);
                  return (
                    <View
                      key={campaign.campaignId}
                      className="rounded-2xl border border-[#E3E9FF] bg-[#F9FAFB] p-4 gap-2"
                    >
                      <View
                        className={`${tw.flexRow} items-center justify-between`}
                      >
                        <View className="rounded-full bg-[#EEF2F7] px-3 py-1">
                          <Text className="text-[11px] font-bold text-[#64748B]">
                            ארכיון
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {campaign.title}
                        </Text>
                      </View>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        {campaign.messageTitle}
                      </Text>
                      <Text
                        className={`text-xs text-[#62748B] ${tw.textStart}`}
                      >
                        הגיע ל-{formatNumber(campaign.reachedUniqueAllTime)}{' '}
                        ייחודיים ·{' '}
                        {formatNumber(campaign.reachedMessagesAllTime)} הודעות
                      </Text>
                      <TouchableOpacity
                        disabled={!canManagePrograms || isRestoring}
                        onPress={() => {
                          void handleRestoreCampaign(campaign.campaignId);
                        }}
                        className={`rounded-xl px-3 py-2 ${
                          canManagePrograms && !isRestoring
                            ? 'bg-[#2F6BFF]'
                            : 'bg-[#CBD5E1]'
                        }`}
                      >
                        {isRestoring ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text className="text-center text-xs font-bold text-white">
                            שחזר
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={isCreateCampaignModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeCreateCampaignModal}
      >
        <View className="flex-1 justify-end bg-black/35">
          <Pressable className="flex-1" onPress={closeCreateCampaignModal} />
          <View className="rounded-t-3xl bg-white p-5 gap-3">
            <View className={`${tw.flexRow} items-center justify-between`}>
              <TouchableOpacity
                onPress={closeCreateCampaignModal}
                className="rounded-full bg-[#EEF2F7] px-3 py-1"
              >
                <Text className="text-xs font-bold text-[#475569]">סגור</Text>
              </TouchableOpacity>
              <Text
                className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                יצירת קמפיין חדש
              </Text>
            </View>

            {!isTemplateSelectorVisible ? (
              <View className="gap-2">
                <TouchableOpacity
                  disabled={!canManagePrograms}
                  onPress={() => setIsTemplateSelectorVisible(true)}
                  className={`rounded-2xl px-4 py-3 ${
                    canManagePrograms ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    תבנית מוכנה
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!canManagePrograms || isCreatingGeneralCampaign}
                  onPress={() => {
                    void handleCreateGeneralCampaign();
                  }}
                  className={`rounded-2xl px-4 py-3 ${
                    canManagePrograms && !isCreatingGeneralCampaign
                      ? 'bg-[#0F766E]'
                      : 'bg-[#CBD5E1]'
                  }`}
                >
                  {isCreatingGeneralCampaign ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-center text-sm font-bold text-white">
                      ליצור חדש
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-2">
                <TouchableOpacity
                  onPress={() => setIsTemplateSelectorVisible(false)}
                  className="self-start rounded-xl bg-[#EEF2F7] px-3 py-1"
                >
                  <Text className="text-xs font-bold text-[#334155]">חזרה</Text>
                </TouchableOpacity>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  {CAMPAIGN_TEMPLATES.map((template) => {
                    const isLoading =
                      isWorkingCampaignId === `create-${template.type}`;
                    return (
                      <TouchableOpacity
                        key={template.type}
                        disabled={!canManagePrograms || isLoading}
                        onPress={() => {
                          void handleCreateTemplateCampaign(template.type);
                        }}
                        className="w-[48.5%] rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-3"
                      >
                        <Text
                          className={`text-xs text-[#5B6475] ${tw.textStart}`}
                        >
                          {template.subtitle}
                        </Text>
                        <Text
                          className={`mt-1 text-sm font-black text-[#142743] ${tw.textStart}`}
                        >
                          {template.icon} {template.title}
                        </Text>
                        {isLoading ? (
                          <ActivityIndicator
                            color="#2F6BFF"
                            style={{ marginTop: 8 }}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
