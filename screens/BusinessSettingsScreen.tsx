import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';
import { tw } from '@/lib/rtl';

type ProfileCompletionField =
  | 'name'
  | 'shortDescription'
  | 'businessPhone'
  | 'address'
  | 'serviceTypes'
  | 'serviceTags'
  | 'discoverySource'
  | 'reason'
  | 'usageAreas'
  | 'ownerAgeRange';

const MISSING_FIELD_LABELS: Record<ProfileCompletionField, string> = {
  name: 'שם העסק',
  shortDescription: 'תיאור קצר',
  businessPhone: 'טלפון עסקי',
  address: 'כתובת העסק',
  serviceTypes: 'סוגי שירות',
  serviceTags: 'תגיות שירות',
  discoverySource: 'מקור הגעה',
  reason: 'סיבת הצטרפות',
  usageAreas: 'אזורי פעילות',
  ownerAgeRange: 'טווח גיל בעלים',
};

const ADD_BUSINESS_LABEL =
  '\u05e6\u05d5\u05e8 \u05e2\u05e1\u05e7 \u05e0\u05d5\u05e1\u05e3';

function MenuRow({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#E3E9FF',
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 14,
          paddingVertical: 14,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View
        style={{
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#EEF3FF',
            borderWidth: 1,
            borderColor: '#DCE6FF',
          }}
        >
          <Ionicons name={icon} size={18} color="#1D4ED8" />
        </View>

        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '800',
              color: '#111827',
              textAlign: 'right',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 3,
              fontSize: 12,
              fontWeight: '500',
              color: '#64748B',
              textAlign: 'right',
            }}
          >
            {subtitle}
          </Text>
        </View>

        <Ionicons name="chevron-back" size={18} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

export default function BusinessSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    businesses,
    activeBusiness,
    activeBusinessId,
    isLoading,
    isSwitchingBusiness,
    setActiveBusinessId,
  } = useActiveBusiness();
  const canEditBusiness =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';
  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );

  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const missingFieldLabels = (
    (businessSettings?.profileCompletion?.missingFields ??
      []) as ProfileCompletionField[]
  )
    .filter(
      (field): field is ProfileCompletionField => field in MISSING_FIELD_LABELS
    )
    .map((field) => MISSING_FIELD_LABELS[field]);

  if (isLoading) {
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
          gap: 12,
        }}
      >
        <BusinessScreenHeader
          title="הגדרות עסק"
          subtitle="ניהול הגדרות העסק במסכים ייעודיים"
        />

        <BusinessModeCtaCard accentButton={true} />

        <View className="rounded-3xl border border-[#E3E9FF] bg-white p-4">
          <Pressable
            onPress={() => setIsPickerVisible(true)}
            disabled={isSwitchingBusiness}
            style={({ pressed }) => [
              {
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#D6E3FF',
                backgroundColor: '#F4F8FF',
                paddingHorizontal: 14,
                paddingVertical: 12,
                opacity: pressed || isSwitchingBusiness ? 0.84 : 1,
              },
            ]}
          >
            <View
              style={{
                flexDirection: 'row-reverse',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View
                style={{
                  flex: 1,
                  alignItems: 'flex-end',
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: '#64748B',
                    textAlign: 'right',
                  }}
                >
                  עסק פעיל
                </Text>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    marginTop: 2,
                    fontSize: 16,
                    fontWeight: '900',
                    color: '#1A2B4A',
                    textAlign: 'right',
                    includeFontPadding: false,
                  }}
                >
                  {activeBusiness?.name ?? 'בחר עסק'}
                </Text>
              </View>

              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#CFE0FF',
                  backgroundColor: '#EEF4FF',
                }}
              >
                {isSwitchingBusiness ? (
                  <ActivityIndicator size="small" color="#2F6BFF" />
                ) : (
                  <Ionicons name="chevron-down" size={16} color="#2F6BFF" />
                )}
              </View>
            </View>
          </Pressable>
        </View>

        {businessSettings?.profileCompletion &&
        !businessSettings.profileCompletion.isComplete ? (
          <View className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-4">
            <View className={`${tw.flexRow} items-center gap-2`}>
              <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
              <Text className="text-sm font-extrabold text-[#92400E]">
                השלם פרטים
              </Text>
            </View>
            <Text className={`mt-1 text-xs text-[#78350F] ${tw.textStart}`}>
              שדות חסרים: {missingFieldLabels.join(' • ') || 'יש להשלים נתונים'}
            </Text>
            {canEditBusiness ? (
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    '/(authenticated)/(business)/settings-business-profile'
                  )
                }
                className="mt-3 rounded-xl border border-[#F59E0B] bg-white px-3 py-2"
              >
                <Text className="text-center text-xs font-bold text-[#92400E]">
                  השלם פרטים
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className={`mt-2 text-xs text-[#92400E] ${tw.textStart}`}>
                השלמת נתונים זמינה לבעלים או למנהל בלבד.
              </Text>
            )}
          </View>
        ) : null}

        <View className="gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
          <MenuRow
            title="פרופיל עסק"
            subtitle="שם העסק, תיאור, טלפון, סוגי שירותים ותגיות"
            icon="business-outline"
            onPress={() =>
              router.push(
                '/(authenticated)/(business)/settings-business-profile'
              )
            }
          />
          <MenuRow
            title="פרטי חשבון"
            subtitle="שם משתמש, אימייל, טלפון ויציאה מהחשבון"
            icon="person-outline"
            onPress={() =>
              router.push(
                '/(authenticated)/(business)/settings-business-account'
              )
            }
          />
          <MenuRow
            title="מנוי וחבילה"
            subtitle="סטטוס מנוי, מגבלות שימוש ושדרוג"
            icon="card-outline"
            onPress={() =>
              router.push(
                '/(authenticated)/(business)/settings-business-subscription'
              )
            }
          />
        </View>
      </ScrollView>

      <Modal
        transparent={true}
        visible={isPickerVisible}
        animationType="fade"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <Pressable
          onPress={() => setIsPickerVisible(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.35)',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: '#DCE6FF',
              backgroundColor: '#FFFFFF',
              padding: 14,
              maxHeight: '72%',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '900',
                color: '#111827',
                textAlign: 'right',
              }}
            >
              בחירת עסק פעיל
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: '#64748B',
                textAlign: 'right',
              }}
            >
              כל העסקים שברשותך
            </Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                gap: 8,
              }}
            >
              {businesses.map((business) => {
                const isActive = business.businessId === activeBusinessId;
                return (
                  <Pressable
                    key={business.businessId}
                    onPress={() => {
                      void setActiveBusinessId(business.businessId)
                        .then(() => setIsPickerVisible(false))
                        .catch(() => {});
                    }}
                    style={({ pressed }) => [
                      {
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isActive ? '#A9C7FF' : '#E3E9FF',
                        backgroundColor: isActive ? '#EAF1FF' : '#FFFFFF',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        opacity: pressed ? 0.86 : 1,
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        gap: 10,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{
                        flex: 1,
                        fontSize: 14,
                        lineHeight: 20,
                        fontWeight: isActive ? '800' : '700',
                        color: '#1A2B4A',
                        textAlign: 'right',
                        includeFontPadding: false,
                      }}
                    >
                      {business.name}
                    </Text>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isActive ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#2563EB"
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => {
                setIsPickerVisible(false);
                router.push(BUSINESS_ONBOARDING_ROUTES.role);
              }}
              style={({ pressed }) => [
                {
                  marginTop: 2,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#A9C7FF',
                  backgroundColor: '#EEF4FF',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  opacity: pressed ? 0.86 : 1,
                  flexDirection: 'row-reverse',
                  alignItems: 'center',
                  gap: 10,
                },
              ]}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  lineHeight: 20,
                  fontWeight: '800',
                  color: '#1D4ED8',
                  textAlign: 'right',
                }}
              >
                {ADD_BUSINESS_LABEL}
              </Text>
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
