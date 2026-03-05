import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { CARD_THEMES } from '@/constants/cardThemes';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import { tw } from '@/lib/rtl';

type ManagementTab = 'programs' | 'campaigns';

const CAMPAIGN_TEMPLATES: Array<{
  type: 'welcome' | 'birthday' | 'anniversary' | 'winback' | 'promo';
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
    tab?: string;
  }>();

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const [activeTab, setActiveTab] = useState<ManagementTab>(
    params.tab === 'campaigns' ? 'campaigns' : 'programs'
  );

  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.businessId === selectedBusinessId),
    [businesses, selectedBusinessId]
  );
  const canManagePrograms =
    selectedBusiness?.staffRole === 'owner' || selectedBusiness?.staffRole === 'manager';

  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
    ) ?? [];

  const campaigns =
    useQuery(
      api.campaigns.listManagementCampaignsByBusiness,
      selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
    ) ?? [];

  const createLoyaltyProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const estimateCampaignAudience = useMutation(api.campaigns.estimateCampaignAudience);
  const sendCampaignNow = useMutation(api.campaigns.sendCampaignNow);
  const { entitlements, limitStatus } = useEntitlements(selectedBusinessId);

  const activePrograms = programs.filter((program) => program.lifecycle === 'active');
  const archivedPrograms = programs.filter(
    (program) => program.lifecycle === 'archived'
  );
  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const requiredPlanForCards =
    entitlements?.requiredPlanMap.byLimitFromCurrentPlan[entitlements.plan]
      .maxCards ?? 'pro';

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
  const [isWorkingCampaignId, setIsWorkingCampaignId] = useState<string | null>(null);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('limit_reached');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    setSelectedBusinessId((current) => {
      if (!businesses.length) {
        return null;
      }
      if (current && businesses.some((business) => business.businessId === current)) {
        return current;
      }
      return businesses[0].businessId;
    });
  }, [businesses]);

  const parsedMaxStamps = Number(maxStamps);
  const canCreateProgram =
    !!selectedBusinessId &&
    canManagePrograms &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    stampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    !isCreatingProgram;

  const openUpgradeForCards = () => {
    const requiredPlan = requiredPlanForCards;
    setUpgradePlan(requiredPlan === 'unlimited' ? 'unlimited' : 'pro');
    setUpgradeReason('limit_reached');
    setUpgradeFeatureKey('maxCards');
    setIsUpgradeVisible(true);
  };

  const handleCreateProgram = async () => {
    if (!selectedBusinessId || !canCreateProgram) {
      return;
    }
    if (cardLimit.isAtLimit) {
      openUpgradeForCards();
      return;
    }

    setIsCreatingProgram(true);
    try {
      await createLoyaltyProgram({
        businessId: selectedBusinessId,
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
      Alert.alert('שגיאה', error instanceof Error ? error.message : 'יצירת כרטיסיה נכשלה.');
    } finally {
      setIsCreatingProgram(false);
    }
  };

  const handleCreateTemplateCampaign = async (
    type: 'welcome' | 'birthday' | 'anniversary' | 'winback' | 'promo'
  ) => {
    if (!selectedBusinessId || !canManagePrograms) {
      return;
    }
    setIsWorkingCampaignId(`create-${type}`);
    try {
      await createCampaignDraft({
        businessId: selectedBusinessId,
        type,
      });
      Alert.alert('טיוטה נוצרה', 'הקמפיין נוסף לרשימת הטיוטות.');
    } catch (error) {
      Alert.alert('שגיאה', error instanceof Error ? error.message : 'יצירת קמפיין נכשלה.');
    } finally {
      setIsWorkingCampaignId(null);
    }
  };

  const handleSendCampaign = async (campaignId: Id<'campaigns'>) => {
    if (!selectedBusinessId || !canManagePrograms) {
      return;
    }

    setIsWorkingCampaignId(String(campaignId));
    try {
      const estimate = await estimateCampaignAudience({
        businessId: selectedBusinessId,
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
                    businessId: selectedBusinessId,
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
                    error instanceof Error ? error.message : 'שליחת קמפיין נכשלה.'
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

  const summaryCards = [
    { id: 'active', label: 'פעילות', value: formatNumber(activePrograms.length) },
    { id: 'archived', label: 'ישנות', value: formatNumber(archivedPrograms.length) },
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
          title="ניהול כרטיסים 2.0"
          subtitle="כרטיסיות, קמפיינים ותובנות במקום אחד"
          titleAccessory={
            <TouchableOpacity
              onPress={() => router.replace('/(authenticated)/(business)/dashboard')}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
            עסק נבחר
          </Text>
          <View className={`${tw.flexRow} flex-wrap gap-2`}>
            {businesses.map((business) => {
              const isActive = business.businessId === selectedBusinessId;
              return (
                <TouchableOpacity
                  key={business.businessId}
                  onPress={() => setSelectedBusinessId(business.businessId)}
                  className={`rounded-2xl border px-4 py-2 ${
                    isActive
                      ? 'border-[#A9C7FF] bg-[#E7F0FF]'
                      : 'border-[#E3E9FF] bg-[#F6F8FC]'
                  }`}
                >
                  <Text className={`text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}>
                    {business.name}
                  </Text>
                  <Text className={`text-[11px] text-[#7B86A0] ${tw.textStart}`}>
                    {business.staffRole}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {[
            { key: 'programs' as const, label: 'כרטיסיות' },
            { key: 'campaigns' as const, label: 'קמפיינים' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
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
            <View className={`${tw.flexRow} flex-wrap gap-3`}>
              {summaryCards.map((card) => (
                <View
                  key={card.id}
                  className="w-[48.5%] rounded-2xl border border-[#DDE7FC] bg-white p-4"
                >
                  <Text className={`text-xs text-[#6F7E9A] ${tw.textStart}`}>{card.label}</Text>
                  <Text className={`mt-1 text-xl font-black text-[#13233F] ${tw.textStart}`}>
                    {card.value}
                  </Text>
                </View>
              ))}
            </View>

            <LockedFeatureWrapper
              isLocked={cardLimit.isAtLimit}
              requiredPlan={requiredPlanForCards}
              onUpgradeClick={openUpgradeForCards}
              title="הגעתם למכסת הכרטיסים הפעילים"
              subtitle="כרטיסיה ישנה לא נספרת במכסה, או שדרגו למסלול מתקדם."
            >
              <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
                <Text className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}>
                  יצירת כרטיסיה חדשה
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="שם הכרטיסיה"
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
                <TextInput
                  value={rewardName}
                  onChangeText={setRewardName}
                  placeholder="הטבה ללקוח"
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
                <View className={`${tw.flexRow} gap-2`}>
                  <TextInput
                    value={maxStamps}
                    onChangeText={setMaxStamps}
                    keyboardType="number-pad"
                    placeholder="ניקובים"
                    placeholderTextColor="#94A3B8"
                    className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                  <TextInput
                    value={stampIcon}
                    onChangeText={setStampIcon}
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
                        onPress={() => setCardThemeId(theme.id)}
                        className={`rounded-xl border px-3 py-2 ${
                          selected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text className="text-xs font-bold text-[#1A2B4A]">{theme.name}</Text>
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
                    <Text className="text-center text-sm font-bold text-white">יצירת כרטיסיה</Text>
                  )}
                </TouchableOpacity>
              </View>
            </LockedFeatureWrapper>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}>
                כרטיסיות פעילות
              </Text>
              {activePrograms.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין עדיין כרטיסיות פעילות.
                </Text>
              ) : (
                activePrograms.map((program) => (
                  <TouchableOpacity
                    key={program.loyaltyProgramId}
                    onPress={() =>
                      router.push({
                        pathname: '/(authenticated)/(business)/cards/[programId]',
                        params: {
                          programId: program.loyaltyProgramId,
                          businessId: selectedBusinessId ?? '',
                        },
                      })
                    }
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
                  >
                    <View className={`${tw.flexRow} items-center justify-between`}>
                      <View className="rounded-full bg-[#EAF1FF] px-3 py-1">
                        <Text className="text-[11px] font-bold text-[#2756C5]">פעילה</Text>
                      </View>
                      <Text className={`text-base font-black text-[#1A2B4A] ${tw.textStart}`}>
                        {program.title}
                      </Text>
                    </View>
                    <Text className={`mt-1 text-xs text-[#62748B] ${tw.textStart}`}>
                      הטבה: {program.rewardName} · ניקובים: {formatNumber(program.maxStamps)}
                    </Text>
                    <Text className={`mt-1 text-xs text-[#62748B] ${tw.textStart}`}>
                      לקוחות פעילים: {formatNumber(program.metrics.activeMembers)} · מימושים 30 יום:{' '}
                      {formatNumber(program.metrics.redemptions30d)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}>
                כרטיסיות ישנות (ארכיון)
              </Text>
              {archivedPrograms.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין כרטיסיות בארכיון.
                </Text>
              ) : (
                archivedPrograms.map((program) => (
                  <TouchableOpacity
                    key={program.loyaltyProgramId}
                    onPress={() =>
                      router.push({
                        pathname: '/(authenticated)/(business)/cards/[programId]',
                        params: {
                          programId: program.loyaltyProgramId,
                          businessId: selectedBusinessId ?? '',
                        },
                      })
                    }
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F9FAFB] p-4"
                  >
                    <View className={`${tw.flexRow} items-center justify-between`}>
                      <View className="rounded-full bg-[#EEF2F7] px-3 py-1">
                        <Text className="text-[11px] font-bold text-[#64748B]">ישנה</Text>
                      </View>
                      <Text className={`text-base font-black text-[#1A2B4A] ${tw.textStart}`}>
                        {program.title}
                      </Text>
                    </View>
                    <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                      לקוחות פעילים: {formatNumber(program.metrics.activeMembers)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ) : (
          <View className="mt-5 gap-4">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}>
                תבניות מהירות
              </Text>
              <View className={`${tw.flexRow} flex-wrap gap-2`}>
                {CAMPAIGN_TEMPLATES.map((template) => {
                  const isLoading = isWorkingCampaignId === `create-${template.type}`;
                  return (
                    <TouchableOpacity
                      key={template.type}
                      disabled={!canManagePrograms || isLoading}
                      onPress={() => {
                        void handleCreateTemplateCampaign(template.type);
                      }}
                      className="w-[48.5%] rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-3"
                    >
                      <Text className={`text-xs text-[#5B6475] ${tw.textStart}`}>{template.subtitle}</Text>
                      <Text className={`mt-1 text-sm font-black text-[#142743] ${tw.textStart}`}>
                        {template.icon} {template.title}
                      </Text>
                      {isLoading ? (
                        <ActivityIndicator color="#2F6BFF" style={{ marginTop: 8 }} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}>
                טיוטות וקמפיינים
              </Text>
              {campaigns.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  אין קמפיינים עדיין. צרו תבנית מהירה כדי להתחיל.
                </Text>
              ) : (
                campaigns.map((campaign) => {
                  const isBusy = isWorkingCampaignId === String(campaign.campaignId);
                  return (
                    <View
                      key={campaign.campaignId}
                      className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4 gap-2"
                    >
                      <View className={`${tw.flexRow} items-center justify-between`}>
                        <View
                          className={`rounded-full px-3 py-1 ${
                            campaign.status === 'sent' ? 'bg-[#DCFCE7]' : 'bg-[#EAF1FF]'
                          }`}
                        >
                          <Text
                            className={`text-[11px] font-bold ${
                              campaign.status === 'sent' ? 'text-[#166534]' : 'text-[#2756C5]'
                            }`}
                          >
                            {campaign.status === 'sent' ? 'נשלח' : 'טיוטה'}
                          </Text>
                        </View>
                        <Text className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}>
                          {campaign.title}
                        </Text>
                      </View>
                      <Text className={`text-xs text-[#62748B] ${tw.textStart}`}>
                        {campaign.messageTitle}
                      </Text>
                      <Text className={`text-xs text-[#62748B] ${tw.textStart}`}>
                        קהל משוער: {formatNumber(campaign.estimatedAudience)} · נוצר:{' '}
                        {formatDate(campaign.createdAt)}
                      </Text>
                      {campaign.status === 'draft' ? (
                        <TouchableOpacity
                          disabled={!canManagePrograms || isBusy}
                          onPress={() => {
                            void handleSendCampaign(campaign.campaignId);
                          }}
                          className={`rounded-xl px-3 py-2 ${
                            canManagePrograms && !isBusy ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
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
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={selectedBusinessId}
        initialPlan={upgradePlan}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
      />
    </SafeAreaView>
  );
}
