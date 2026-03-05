import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
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
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS } from '@/config/appConfig';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';
import { tw } from '@/lib/rtl';

type BusinessServiceType =
  | 'food_drink'
  | 'beauty'
  | 'health_wellness'
  | 'fitness'
  | 'retail'
  | 'professional_services'
  | 'education'
  | 'hospitality'
  | 'other';

type OnboardingSnapshot = {
  discoverySource?: string;
  reason?: string;
  usageAreas?: string[];
  ownerAgeRange?: string;
  collectedAt?: number;
};

const SERVICE_TYPE_LIMIT = 6;
const SERVICE_TAG_LIMIT = 8;
const SERVICE_TAG_MIN_LENGTH = 2;
const SERVICE_TAG_MAX_LENGTH = 24;

const BUSINESS_SERVICE_TYPE_OPTIONS: Array<{
  id: BusinessServiceType;
  label: string;
}> = [
  { id: 'food_drink', label: 'מזון ומשקאות' },
  { id: 'beauty', label: 'יופי וטיפוח' },
  { id: 'health_wellness', label: 'בריאות ורווחה' },
  { id: 'fitness', label: 'כושר וספורט' },
  { id: 'retail', label: 'קמעונאות' },
  { id: 'professional_services', label: 'שירותים מקצועיים' },
  { id: 'education', label: 'לימודים והדרכה' },
  { id: 'hospitality', label: 'אירוח ופנאי' },
  { id: 'other', label: 'אחר' },
];

const BUSINESS_SERVICE_TYPE_SET = new Set<BusinessServiceType>(
  BUSINESS_SERVICE_TYPE_OPTIONS.map((option) => option.id)
);

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

function formatLimitValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value === -1) {
    return 'ללא הגבלה';
  }
  return String(value);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function sanitizeServiceTypes(value: string[] | undefined) {
  const unique: BusinessServiceType[] = [];
  if (!value) {
    return unique;
  }

  for (const item of value) {
    if (!BUSINESS_SERVICE_TYPE_SET.has(item as BusinessServiceType)) {
      continue;
    }
    const normalized = item as BusinessServiceType;
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
    if (unique.length >= SERVICE_TYPE_LIMIT) {
      break;
    }
  }

  return unique;
}

function sanitizeServiceTags(value: string[] | undefined) {
  const unique: string[] = [];
  if (!value) {
    return unique;
  }

  for (const item of value) {
    const normalized = normalizeText(item);
    if (
      normalized.length < SERVICE_TAG_MIN_LENGTH ||
      normalized.length > SERVICE_TAG_MAX_LENGTH
    ) {
      continue;
    }
    const normalizedLower = normalized.toLowerCase();
    if (
      !unique.some(
        (existingTag) => existingTag.toLowerCase() === normalizedLower
      )
    ) {
      unique.push(normalized);
    }
    if (unique.length >= SERVICE_TAG_LIMIT) {
      break;
    }
  }

  return unique;
}

function arraysEqual<T>(first: T[], second: T[]) {
  if (first.length !== second.length) {
    return false;
  }
  return first.every((value, index) => value === second[index]);
}

function formatReadOnlyValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : 'לא זמין';
}

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();

  const businessesQuery = useQuery(api.scanner.myBusinesses);
  const businesses = businessesQuery ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);

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
  const canEditBusiness =
    selectedBusiness?.staffRole === 'owner' ||
    selectedBusiness?.staffRole === 'manager';

  const [businessName, setBusinessName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<
    BusinessServiceType[]
  >([]);
  const [serviceTags, setServiceTags] = useState<string[]>([]);
  const [newServiceTag, setNewServiceTag] = useState('');
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);

  useEffect(() => {
    setBusinessName(businessSettings?.name ?? '');
    setShortDescription(businessSettings?.shortDescription ?? '');
    setBusinessPhone(businessSettings?.businessPhone ?? '');
    setSelectedServiceTypes(
      sanitizeServiceTypes(businessSettings?.serviceTypes)
    );
    setServiceTags(sanitizeServiceTags(businessSettings?.serviceTags));
    setNewServiceTag('');
  }, [
    businessSettings?.name,
    businessSettings?.shortDescription,
    businessSettings?.businessPhone,
    businessSettings?.serviceTypes,
    businessSettings?.serviceTags,
  ]);

  const normalizedBusinessName = useMemo(
    () => normalizeText(businessName),
    [businessName]
  );
  const normalizedShortDescription = useMemo(
    () => normalizeText(shortDescription),
    [shortDescription]
  );
  const normalizedBusinessPhone = useMemo(
    () => normalizeText(businessPhone),
    [businessPhone]
  );
  const normalizedServiceTags = useMemo(
    () => sanitizeServiceTags(serviceTags),
    [serviceTags]
  );

  const initialProfileState = useMemo(
    () => ({
      name: normalizeText(businessSettings?.name ?? ''),
      shortDescription: normalizeText(businessSettings?.shortDescription ?? ''),
      businessPhone: normalizeText(businessSettings?.businessPhone ?? ''),
      serviceTypes: sanitizeServiceTypes(businessSettings?.serviceTypes),
      serviceTags: sanitizeServiceTags(businessSettings?.serviceTags),
    }),
    [
      businessSettings?.name,
      businessSettings?.shortDescription,
      businessSettings?.businessPhone,
      businessSettings?.serviceTypes,
      businessSettings?.serviceTags,
    ]
  );

  const isBusinessProfileDirty =
    normalizedBusinessName !== initialProfileState.name ||
    normalizedShortDescription !== initialProfileState.shortDescription ||
    normalizedBusinessPhone !== initialProfileState.businessPhone ||
    !arraysEqual(selectedServiceTypes, initialProfileState.serviceTypes) ||
    !arraysEqual(normalizedServiceTags, initialProfileState.serviceTags);

  const canSaveBusiness =
    canEditBusiness &&
    !isSavingBusiness &&
    normalizedBusinessName.length > 0 &&
    isBusinessProfileDirty;

  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
    [programs]
  );

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

  const onboardingSnapshot = (businessSettings?.onboardingSnapshot ??
    null) as OnboardingSnapshot | null;
  const onboardingUsageAreas =
    onboardingSnapshot?.usageAreas && onboardingSnapshot.usageAreas.length > 0
      ? onboardingSnapshot.usageAreas.join(', ')
      : null;
  const onboardingCollectedAt =
    typeof onboardingSnapshot?.collectedAt === 'number'
      ? new Date(onboardingSnapshot.collectedAt).toLocaleDateString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : null;

  const handleToggleServiceType = (serviceType: BusinessServiceType) => {
    if (!canEditBusiness) {
      return;
    }

    setSelectedServiceTypes((current) => {
      if (current.includes(serviceType)) {
        return current.filter((item) => item !== serviceType);
      }

      if (current.length >= SERVICE_TYPE_LIMIT) {
        Alert.alert('שגיאה', 'ניתן לבחור עד 6 סוגי שירותים.');
        return current;
      }
      return [...current, serviceType];
    });
  };

  const handleAddServiceTag = () => {
    if (!canEditBusiness) {
      return;
    }

    const normalized = normalizeText(newServiceTag);
    if (!normalized) {
      return;
    }

    if (normalized.length < SERVICE_TAG_MIN_LENGTH) {
      Alert.alert('שגיאה', 'תגית חייבת להכיל לפחות 2 תווים.');
      return;
    }

    if (normalized.length > SERVICE_TAG_MAX_LENGTH) {
      Alert.alert('שגיאה', 'תגית יכולה להכיל עד 24 תווים.');
      return;
    }

    const normalizedLower = normalized.toLowerCase();
    if (serviceTags.some((tag) => tag.toLowerCase() === normalizedLower)) {
      setNewServiceTag('');
      return;
    }

    if (serviceTags.length >= SERVICE_TAG_LIMIT) {
      Alert.alert('שגיאה', 'ניתן להוסיף עד 8 תגיות.');
      return;
    }

    setServiceTags((current) => [...current, normalized]);
    setNewServiceTag('');
  };

  const handleRemoveServiceTag = (tagToRemove: string) => {
    if (!canEditBusiness) {
      return;
    }

    setServiceTags((current) =>
      current.filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase())
    );
  };

  const handleSaveBusiness = async () => {
    if (!selectedBusinessId || !canSaveBusiness) {
      return;
    }

    setIsSavingBusiness(true);
    try {
      await updateBusinessProfile({
        businessId: selectedBusinessId,
        name: normalizedBusinessName,
        shortDescription: normalizedShortDescription,
        businessPhone: normalizedBusinessPhone,
        serviceTypes: selectedServiceTypes,
        serviceTags: normalizedServiceTags,
      });
      Alert.alert('נשמר', 'פרופיל העסק עודכן בהצלחה.');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'עדכון פרופיל העסק נכשל.'
      );
    } finally {
      setIsSavingBusiness(false);
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
          <View className="mt-6 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
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

        <BusinessModeCtaCard style={{ marginTop: 14 }} />

        <View className="mt-4 gap-2 rounded-3xl border border-[#E3E9FF] bg-white p-4">
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

        {selectedBusinessId && businessSettings === undefined ? (
          <View className="mt-4 items-center rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : null}

        {businessSettings ? (
          <>
            <View className="mt-4 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                פרופיל עסק
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

              <Text
                className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
              >
                תיאור קצר
              </Text>
              <TextInput
                value={shortDescription}
                onChangeText={setShortDescription}
                editable={canEditBusiness}
                placeholder="תיאור קצר של העסק (עד 220 תווים)"
                placeholderTextColor="#94A3B8"
                multiline={true}
                textAlignVertical="top"
                maxLength={220}
                className="min-h-[96px] rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />

              <Text
                className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
              >
                טלפון עסקי
              </Text>
              <TextInput
                value={businessPhone}
                onChangeText={setBusinessPhone}
                editable={canEditBusiness}
                placeholder="טלפון עסקי"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={24}
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />

              <Text
                className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
              >
                סוגי שירותים
              </Text>
              <View className={`${tw.flexRow} flex-wrap gap-2`}>
                {BUSINESS_SERVICE_TYPE_OPTIONS.map((option) => {
                  const isSelected = selectedServiceTypes.includes(option.id);
                  return (
                    <TouchableOpacity
                      key={option.id}
                      disabled={!canEditBusiness}
                      onPress={() => handleToggleServiceType(option.id)}
                      className={`rounded-2xl border px-3 py-2 ${
                        isSelected
                          ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                          : 'border-[#DCE6F7] bg-[#F8FAFF]'
                      } ${!canEditBusiness ? 'opacity-70' : ''}`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-[#2F6BFF]' : 'text-[#1A2B4A]'
                        }`}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-xs text-[#64748B]">
                  {serviceTags.length}/{SERVICE_TAG_LIMIT}
                </Text>
                <Text
                  className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
                >
                  תגיות חופשיות
                </Text>
              </View>

              <View className={`${tw.flexRow} flex-wrap gap-2`}>
                {serviceTags.map((tag) => (
                  <View
                    key={tag}
                    className={`${tw.flexRow} items-center gap-2 rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-3 py-2`}
                  >
                    {canEditBusiness ? (
                      <TouchableOpacity
                        onPress={() => handleRemoveServiceTag(tag)}
                      >
                        <Text className="text-xs font-black text-[#EF4444]">
                          ×
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <Text className="text-xs font-semibold text-[#1A2B4A]">
                      {tag}
                    </Text>
                  </View>
                ))}
                {serviceTags.length === 0 ? (
                  <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                    אין תגיות
                  </Text>
                ) : null}
              </View>

              <View className={`${tw.flexRow} gap-2`}>
                <TouchableOpacity
                  disabled={!canEditBusiness}
                  onPress={handleAddServiceTag}
                  className={`rounded-2xl px-4 py-3 ${
                    canEditBusiness ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-xs font-bold text-white">
                    הוסף תגית
                  </Text>
                </TouchableOpacity>
                <TextInput
                  value={newServiceTag}
                  onChangeText={setNewServiceTag}
                  editable={canEditBusiness}
                  placeholder="תגית חדשה"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>

              {!canEditBusiness ? (
                <Text className={`text-xs text-[#7B86A0] ${tw.textStart}`}>
                  עריכת פרטי העסק זמינה לבעלים ומנהל בלבד.
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
                  {businessSettings.formattedAddress || 'לא הוגדרה כתובת'}
                </Text>
                <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                  {businessSettings.city || '-'} ·{' '}
                  {businessSettings.street || '-'} ·{' '}
                  {businessSettings.streetNumber || '-'}
                </Text>
              </View>
            </View>

            <View className="mt-4 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                סיכום אונבורדינג
              </Text>

              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatReadOnlyValue(onboardingSnapshot?.discoverySource)}
                </Text>
                <Text className="text-xs text-[#64748B]">איך הגעת אלינו</Text>
              </View>

              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatReadOnlyValue(onboardingSnapshot?.reason)}
                </Text>
                <Text className="text-xs text-[#64748B]">סיבת הצטרפות</Text>
              </View>

              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatReadOnlyValue(onboardingUsageAreas)}
                </Text>
                <Text className="text-xs text-[#64748B]">אזורי פעילות</Text>
              </View>

              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatReadOnlyValue(onboardingSnapshot?.ownerAgeRange)}
                </Text>
                <Text className="text-xs text-[#64748B]">טווח גיל</Text>
              </View>

              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatReadOnlyValue(onboardingCollectedAt)}
                </Text>
                <Text className="text-xs text-[#64748B]">נאסף בתאריך</Text>
              </View>
            </View>
          </>
        ) : null}

        <View className="mt-4 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            פרטי חשבון משתמש
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
          className={`mt-3 rounded-2xl px-4 py-3 ${
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

        <View className="mt-4 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            מנוי וחבילה
          </Text>

          {isEntitlementsLoading ? (
            <ActivityIndicator color="#2F6BFF" />
          ) : (
            <>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {entitlements
                    ? BUSINESS_PLAN_LABELS[entitlements.plan]
                    : 'Starter'}
                </Text>
                <Text className="text-xs text-[#64748B]">מסלול נוכחי</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {entitlements
                    ? SUBSCRIPTION_STATUS_LABELS[
                        entitlements.subscriptionStatus
                      ]
                    : 'פעיל'}
                </Text>
                <Text className="text-xs text-[#64748B]">סטטוס מנוי</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {entitlements?.billingPeriod
                    ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
                    : '-'}
                </Text>
                <Text className="text-xs text-[#64748B]">מחזור חיוב</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatLimitValue(cardLimit.limitValue)} (
                  {activePrograms.length} בשימוש)
                </Text>
                <Text className="text-xs text-[#64748B]">כמות כרטיסים</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatLimitValue(customerLimit.limitValue)}
                </Text>
                <Text className="text-xs text-[#64748B]">לקוחות</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatLimitValue(aiLimit.limitValue)} (
                  {entitlements?.usage.aiCampaignsUsedThisMonth ?? 0} בשימוש)
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
          className={`mt-3 rounded-2xl px-4 py-3 ${
            selectedBusinessId ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
          }`}
        >
          <Text className="text-center text-sm font-bold text-white">
            ניהול חבילה
          </Text>
        </TouchableOpacity>

        <View className="mt-4 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            כרטיסים וקמפיינים
          </Text>
          <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
            עריכת תוכניות נאמנות וקמפיינים נמצאת במסך הייעודי לניהול כרטיסים.
          </Text>
          <TouchableOpacity
            onPress={() =>
              router.push('/(authenticated)/(business)/cards?tab=programs')
            }
            className="rounded-2xl bg-[#2F6BFF] px-4 py-3"
          >
            <Text className="text-center text-sm font-bold text-white">
              מעבר למסך כרטיסים וקמפיינים
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => {
            void handleSaveBusiness();
          }}
          disabled={!canSaveBusiness}
          className={`mt-4 rounded-2xl px-4 py-3 ${
            canSaveBusiness ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
          }`}
        >
          {isSavingBusiness ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-center text-sm font-bold text-white">
              שמירת פרופיל עסק
            </Text>
          )}
        </TouchableOpacity>
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
