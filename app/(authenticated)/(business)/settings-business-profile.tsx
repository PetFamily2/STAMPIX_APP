import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
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
      !unique.some((existingTag) => existingTag.toLowerCase() === normalizedLower)
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

export default function BusinessSettingsProfileScreen() {
  const insets = useSafeAreaInsets();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const canEditBusiness =
    activeBusiness?.staffRole === 'owner' || activeBusiness?.staffRole === 'manager';

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const updateBusinessProfile = useMutation(api.business.updateBusinessProfile);

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
    businessSettings?.businessPhone,
    businessSettings?.name,
    businessSettings?.serviceTags,
    businessSettings?.serviceTypes,
    businessSettings?.shortDescription,
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
    if (!activeBusinessId || !canSaveBusiness) {
      return;
    }

    setIsSavingBusiness(true);
    try {
      await updateBusinessProfile({
        businessId: activeBusinessId,
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

  if (!activeBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="text-center text-sm text-[#64748B]">
          לא נמצא עסק פעיל.
        </Text>
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
          gap: 12,
        }}
      >
        <BusinessScreenHeader
          title="פרופיל עסק"
          subtitle="ניהול נתוני העסק לסיווג, חיפוש ומיון"
          titleAccessory={
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Ionicons name="chevron-forward" size={20} color="#111827" />
            </Pressable>
          }
        />

        {businessSettings === undefined ? (
          <View className="items-center rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : (
          <View className="gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <Text className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}>
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

            <Text className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}>
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

            <Text className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}>
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

            <Text className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}>
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
              <Text className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}>
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
                    <TouchableOpacity onPress={() => handleRemoveServiceTag(tag)}>
                      <Text className="text-xs font-black text-[#EF4444]">×</Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text className="text-xs font-semibold text-[#1A2B4A]">{tag}</Text>
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
              <Text className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}>
                כתובת (קריאה בלבד)
              </Text>
              <Text
                className={`mt-1 text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
              >
                {businessSettings?.formattedAddress || 'לא הוגדרה כתובת'}
              </Text>
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {businessSettings?.city || '-'} · {businessSettings?.street || '-'} ·{' '}
                {businessSettings?.streetNumber || '-'}
              </Text>
            </View>
          </View>
        )}

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
              שמירת פרופיל עסק
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
