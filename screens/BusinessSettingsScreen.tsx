import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
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
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS } from '@/config/appConfig';
import { CARD_THEMES, resolveCardTheme } from '@/constants/cardThemes';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';
import { tw } from '@/lib/rtl';

type SectionKey = 'store' | 'profile' | 'package';

const SECTION_TABS: Array<{ key: SectionKey; label: string }> = [
  { key: 'store', label: 'הגדרות חנות' },
  { key: 'profile', label: 'פרופיל חשבון' },
  { key: 'package', label: 'חבילה' },
];

const BUSINESS_PLAN_LABELS: Record<'starter' | 'pro' | 'unlimited', string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  unlimited: 'Unlimited AI',
};

const SUBSCRIPTION_STATUS_LABELS: Record<
  'active' | 'trialing' | 'past_due' | 'canceled',
  string
> = {
  active: 'פעיל',
  trialing: 'ניסיון',
  past_due: 'תשלום נכשל',
  canceled: 'מבוטל',
};

function parseSection(section: unknown): SectionKey {
  if (Array.isArray(section)) {
    return parseSection(section[0]);
  }
  if (section === 'profile' || section === 'package') {
    return section;
  }
  return 'store';
}

function formatLimitValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value === -1) {
    return 'ללא הגבלה';
  }
  return String(value);
}

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();

  const businessesQuery = useQuery(api.scanner.myBusinesses);
  const businesses = businessesQuery ?? [];

  const [activeSection, setActiveSection] = useState<SectionKey>(() =>
    parseSection(params.section)
  );
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);

  useEffect(() => {
    setActiveSection(parseSection(params.section));
  }, [params.section]);

  useEffect(() => {
    setSelectedBusinessId((current) => {
      if (!businesses.length) {
        return null;
      }
      if (
        current &&
        businesses.some((business) => business.businessId === current)
      ) {
        return current;
      }
      return businesses[0].businessId;
    });
  }, [businesses]);

  const selectedBusiness = useMemo(
    () =>
      businesses.find((business) => business.businessId === selectedBusinessId),
    [businesses, selectedBusinessId]
  );

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
  );
  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
    ) ?? [];
  const {
    entitlements,
    limitStatus,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(selectedBusinessId);

  const updateBusinessProfile = useMutation(api.business.updateBusinessProfile);
  const updateProgramForManagement = useMutation(
    api.loyaltyPrograms.updateProgramForManagement
  );

  const canEditBusiness =
    selectedBusiness?.staffRole === 'owner' ||
    selectedBusiness?.staffRole === 'manager';

  const [businessName, setBusinessName] = useState('');
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);

  useEffect(() => {
    setBusinessName(businessSettings?.name ?? '');
  }, [businessSettings?.name]);

  const canSaveBusiness =
    canEditBusiness &&
    !isSavingBusiness &&
    businessName.trim().length > 0 &&
    businessName.trim() !== (businessSettings?.name ?? '').trim();

  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
    [programs]
  );

  const [selectedProgramId, setSelectedProgramId] =
    useState<Id<'loyaltyPrograms'> | null>(null);
  useEffect(() => {
    setSelectedProgramId((current) => {
      if (!activePrograms.length) {
        return null;
      }
      if (
        current &&
        activePrograms.some((program) => program.loyaltyProgramId === current)
      ) {
        return current;
      }
      return activePrograms[0].loyaltyProgramId;
    });
  }, [activePrograms]);

  const selectedProgram = useMemo(
    () =>
      activePrograms.find(
        (program) => program.loyaltyProgramId === selectedProgramId
      ) ?? null,
    [activePrograms, selectedProgramId]
  );

  const [programTitle, setProgramTitle] = useState('');
  const [programRewardName, setProgramRewardName] = useState('');
  const [programMaxStamps, setProgramMaxStamps] = useState('10');
  const [programStampIcon, setProgramStampIcon] = useState('star');
  const [programThemeId, setProgramThemeId] = useState(CARD_THEMES[0].id);
  const [isSavingProgram, setIsSavingProgram] = useState(false);

  useEffect(() => {
    if (!selectedProgram) {
      setProgramTitle('');
      setProgramRewardName('');
      setProgramMaxStamps('10');
      setProgramStampIcon('star');
      setProgramThemeId(CARD_THEMES[0].id);
      return;
    }
    setProgramTitle(selectedProgram.title);
    setProgramRewardName(selectedProgram.rewardName);
    setProgramMaxStamps(String(selectedProgram.maxStamps));
    setProgramStampIcon(selectedProgram.stampIcon);
    setProgramThemeId(selectedProgram.cardThemeId);
  }, [selectedProgram]);

  const parsedMaxStamps = Number(programMaxStamps);
  const canSaveProgram =
    canEditBusiness &&
    selectedBusinessId !== null &&
    selectedProgram !== null &&
    !isSavingProgram &&
    programTitle.trim().length > 0 &&
    programRewardName.trim().length > 0 &&
    programStampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    (programTitle.trim() !== selectedProgram.title.trim() ||
      programRewardName.trim() !== selectedProgram.rewardName.trim() ||
      parsedMaxStamps !== selectedProgram.maxStamps ||
      programStampIcon.trim() !== selectedProgram.stampIcon.trim() ||
      programThemeId !== selectedProgram.cardThemeId);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);

  const [isSigningOut, setIsSigningOut] = useState(false);

  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const customerLimit = limitStatus('maxCustomers');
  const aiLimit = limitStatus(
    'maxAiCampaignsPerMonth',
    entitlements?.usage.aiCampaignsUsedThisMonth
  );

  const user = sessionContext?.user;
  const userFullName =
    user?.fullName?.trim() ||
    [user?.firstName?.trim(), user?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'ללא שם';

  const selectedTheme = resolveCardTheme(programThemeId);

  const navigateToSection = (section: SectionKey) => {
    setActiveSection(section);
    router.setParams({ section });
  };

  const handleSaveBusiness = async () => {
    if (!selectedBusinessId || !canSaveBusiness) {
      return;
    }

    setIsSavingBusiness(true);
    try {
      await updateBusinessProfile({
        businessId: selectedBusinessId,
        name: businessName.trim(),
      });
      Alert.alert('נשמר', 'שם העסק עודכן בהצלחה.');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'עדכון שם העסק נכשל.'
      );
    } finally {
      setIsSavingBusiness(false);
    }
  };

  const handleSaveProgram = async () => {
    if (!selectedBusinessId || !selectedProgram || !canSaveProgram) {
      return;
    }

    setIsSavingProgram(true);
    try {
      await updateProgramForManagement({
        businessId: selectedBusinessId,
        programId: selectedProgram.loyaltyProgramId,
        title: programTitle.trim(),
        rewardName: programRewardName.trim(),
        maxStamps: parsedMaxStamps,
        stampIcon: programStampIcon.trim(),
        cardThemeId: programThemeId,
      });
      Alert.alert('נשמר', 'הכרטיס עודכן בהצלחה.');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'עדכון הכרטיס נכשל.'
      );
    } finally {
      setIsSavingProgram(false);
    }
  };

  const openPackageManager = () => {
    const initialPlan =
      entitlements?.plan === 'unlimited' ? 'unlimited' : 'pro';
    const reason =
      entitlements && !entitlements.isSubscriptionActive
        ? 'subscription_inactive'
        : 'feature_locked';

    setUpgradePlan(initialPlan);
    setUpgradeReason(reason);
    setUpgradeFeatureKey('business_subscription');
    setIsUpgradeVisible(true);
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לבצע יציאה. נסו שוב.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (businessesQuery === undefined) {
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
            title="הגדרות עסק"
            subtitle="חיבור נתוני העסק והחשבון"
          />
          <View className="mt-6 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
            <Text
              className={`text-base font-extrabold text-[#1A2B4A] ${tw.textStart}`}
            >
              עדיין לא קיים עסק מחובר לחשבון.
            </Text>
            <Text className={`text-sm text-[#62748B] ${tw.textStart}`}>
              התחילו אונבורדינג עסקי כדי להגדיר חנות, כרטיס נאמנות וחבילה.
            </Text>
            <TouchableOpacity
              onPress={() => router.push(BUSINESS_ONBOARDING_ROUTES.role)}
              className="rounded-2xl bg-[#2F6BFF] px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-white">
                מעבר לאונבורדינג עסקי
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
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 30,
        }}
      >
        <BusinessScreenHeader
          title="הגדרות עסק"
          subtitle="ניהול פרטי עסק, חשבון וחבילה"
        />

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-4 gap-2">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            בחירת עסק
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
                  <Text
                    className={`text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
                  >
                    {business.name}
                  </Text>
                  <Text
                    className={`text-[11px] text-[#7B86A0] ${tw.textStart}`}
                  >
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
          {SECTION_TABS.map((tab) => {
            const isActive = activeSection === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => navigateToSection(tab.key)}
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

        {activeSection === 'store' ? (
          <View className="mt-5 gap-4">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                פרטי עסק
              </Text>

              <Text
                className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
              >
                שם העסק
              </Text>
              <TextInput
                value={businessName}
                onChangeText={setBusinessName}
                editable={canEditBusiness}
                placeholder="שם העסק"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />

              <TouchableOpacity
                onPress={() => {
                  void handleSaveBusiness();
                }}
                disabled={!canSaveBusiness}
                className={`rounded-2xl px-4 py-3 ${
                  canSaveBusiness ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                }`}
              >
                {isSavingBusiness ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    שמור שם עסק
                  </Text>
                )}
              </TouchableOpacity>

              {!canEditBusiness ? (
                <Text className={`text-xs text-[#7B86A0] ${tw.textStart}`}>
                  עריכת פרטי העסק זמינה לבעלים/מנהל בלבד.
                </Text>
              ) : null}

              <View className="mt-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4">
                <Text
                  className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
                >
                  כתובת (קריאה בלבד)
                </Text>
                <Text
                  className={`mt-1 text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
                >
                  {businessSettings?.formattedAddress || 'לא הוגדרה כתובת'}
                </Text>
                <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                  {businessSettings?.city || '-'} ·{' '}
                  {businessSettings?.street || '-'} ·{' '}
                  {businessSettings?.streetNumber || '-'}
                </Text>
              </View>
            </View>

            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                תוכנית נאמנות
              </Text>

              {activePrograms.length === 0 ? (
                <View className="gap-3">
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין תוכנית נאמנות פעילה לעסק זה.
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        '/(authenticated)/(business)/cards?tab=programs'
                      )
                    }
                    className="rounded-2xl bg-[#2F6BFF] px-4 py-3"
                  >
                    <Text className="text-center text-sm font-bold text-white">
                      מעבר ליצירת תוכנית
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className={`${tw.flexRow} flex-wrap gap-2`}>
                    {activePrograms.map((program) => {
                      const isSelected =
                        program.loyaltyProgramId === selectedProgramId;
                      return (
                        <TouchableOpacity
                          key={program.loyaltyProgramId}
                          onPress={() =>
                            setSelectedProgramId(program.loyaltyProgramId)
                          }
                          className={`rounded-xl border px-3 py-2 ${
                            isSelected
                              ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                              : 'border-[#DCE6F7] bg-[#F8FAFF]'
                          }`}
                        >
                          <Text className="text-xs font-bold text-[#1A2B4A]">
                            {program.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <LinearGradient
                    colors={selectedTheme.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="rounded-2xl p-4"
                  >
                    <View
                      style={{ backgroundColor: selectedTheme.glow }}
                      className="absolute -top-6 -left-6 h-20 w-20 rounded-full"
                    />
                    <Text
                      className={`text-base font-black ${tw.textStart}`}
                      style={{ color: selectedTheme.titleColor }}
                    >
                      {programTitle || selectedProgram?.title || 'כרטיס נאמנות'}
                    </Text>
                    <Text
                      className={`mt-1 text-xs ${tw.textStart}`}
                      style={{ color: selectedTheme.subtitleColor }}
                    >
                      הטבה:{' '}
                      {programRewardName || selectedProgram?.rewardName || '-'}
                    </Text>
                  </LinearGradient>

                  <TextInput
                    value={programTitle}
                    onChangeText={setProgramTitle}
                    editable={canEditBusiness}
                    placeholder="שם הכרטיס"
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                  <TextInput
                    value={programRewardName}
                    onChangeText={setProgramRewardName}
                    editable={canEditBusiness}
                    placeholder="שם הטבה"
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                  <View className={`${tw.flexRow} gap-2`}>
                    <TextInput
                      value={programMaxStamps}
                      onChangeText={setProgramMaxStamps}
                      editable={canEditBusiness}
                      keyboardType="number-pad"
                      placeholder="כמות ניקובים"
                      placeholderTextColor="#94A3B8"
                      className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                    />
                    <TextInput
                      value={programStampIcon}
                      onChangeText={setProgramStampIcon}
                      editable={canEditBusiness}
                      placeholder="אייקון"
                      placeholderTextColor="#94A3B8"
                      className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                    />
                  </View>
                  <View className={`${tw.flexRow} flex-wrap gap-2`}>
                    {CARD_THEMES.map((theme) => {
                      const isSelected = programThemeId === theme.id;
                      return (
                        <TouchableOpacity
                          key={theme.id}
                          disabled={!canEditBusiness}
                          onPress={() => setProgramThemeId(theme.id)}
                          className={`rounded-xl border px-3 py-2 ${
                            isSelected
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
                    disabled={!canSaveProgram}
                    onPress={() => {
                      void handleSaveProgram();
                    }}
                    className={`rounded-2xl px-4 py-3 ${
                      canSaveProgram ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                    }`}
                  >
                    {isSavingProgram ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text className="text-center text-sm font-bold text-white">
                        שמור תוכנית נאמנות
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : null}

        {activeSection === 'profile' ? (
          <View className="mt-5 gap-4">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                חשבון משתמש
              </Text>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {userFullName}
                </Text>
                <Text className="text-xs text-[#64748B]">שם מלא</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {user?.email || 'לא מוגדר'}
                </Text>
                <Text className="text-xs text-[#64748B]">אימייל</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {user?.phone || 'לא מוגדר'}
                </Text>
                <Text className="text-xs text-[#64748B]">טלפון</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                void handleSignOut();
              }}
              disabled={isSigningOut}
              className={`rounded-2xl px-4 py-3 ${
                isSigningOut ? 'bg-[#FCA5A5]' : 'bg-[#DC2626]'
              }`}
            >
              {isSigningOut ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-sm font-bold text-white">
                  יציאה מהחשבון
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {activeSection === 'package' ? (
          <View className="mt-5 gap-4">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                מנוי וחבילה
              </Text>

              {isEntitlementsLoading ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : (
                <>
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="text-sm font-bold text-[#1A2B4A]">
                      {entitlements
                        ? BUSINESS_PLAN_LABELS[entitlements.plan]
                        : 'Starter'}
                    </Text>
                    <Text className="text-xs text-[#64748B]">מסלול נוכחי</Text>
                  </View>
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="text-sm font-bold text-[#1A2B4A]">
                      {entitlements
                        ? SUBSCRIPTION_STATUS_LABELS[
                            entitlements.subscriptionStatus
                          ]
                        : 'פעיל'}
                    </Text>
                    <Text className="text-xs text-[#64748B]">סטטוס מנוי</Text>
                  </View>
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="text-sm font-bold text-[#1A2B4A]">
                      {entitlements?.billingPeriod
                        ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
                        : '-'}
                    </Text>
                    <Text className="text-xs text-[#64748B]">מחזור חיוב</Text>
                  </View>
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="text-sm font-bold text-[#1A2B4A]">
                      {formatLimitValue(cardLimit.limitValue)} (
                      {activePrograms.length} בשימוש)
                    </Text>
                    <Text className="text-xs text-[#64748B]">כמות כרטיסים</Text>
                  </View>
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="text-sm font-bold text-[#1A2B4A]">
                      {formatLimitValue(customerLimit.limitValue)}
                    </Text>
                    <Text className="text-xs text-[#64748B]">לקוחות</Text>
                  </View>
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="text-sm font-bold text-[#1A2B4A]">
                      {formatLimitValue(aiLimit.limitValue)} (
                      {entitlements?.usage.aiCampaignsUsedThisMonth ?? 0}{' '}
                      בשימוש)
                    </Text>
                    <Text className="text-xs text-[#64748B]">
                      קמפייני AI / חודש
                    </Text>
                  </View>
                </>
              )}
            </View>

            <TouchableOpacity
              onPress={openPackageManager}
              disabled={!selectedBusinessId}
              className={`rounded-2xl px-4 py-3 ${
                selectedBusinessId ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
              }`}
            >
              <Text className="text-center text-sm font-bold text-white">
                ניהול חבילה
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
