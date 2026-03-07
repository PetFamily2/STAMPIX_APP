import { Ionicons } from '@expo/vector-icons';
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
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';
import { tw } from '@/lib/rtl';

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

  const [isPickerVisible, setIsPickerVisible] = useState(false);

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

        <BusinessModeCtaCard />

        <View className="rounded-3xl border border-[#E3E9FF] bg-white p-4">
          <View className={`${tw.flexRow} items-center justify-between`}>
            <Pressable
              onPress={() => setIsPickerVisible(true)}
              disabled={isSwitchingBusiness}
              style={({ pressed }) => [
                {
                  flexDirection: 'row-reverse',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#CFE0FF',
                  backgroundColor: '#F3F7FF',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  opacity: pressed || isSwitchingBusiness ? 0.82 : 1,
                },
              ]}
            >
              {isSwitchingBusiness ? (
                <ActivityIndicator size="small" color="#2F6BFF" />
              ) : (
                <Ionicons name="chevron-down" size={14} color="#2F6BFF" />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: '#1D4ED8',
                  textAlign: 'right',
                }}
              >
                {activeBusiness?.name ?? 'בחר עסק'}
              </Text>
            </Pressable>

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
          </View>
        </View>

        <View className="gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
          <MenuRow
            title="פרופיל עסק"
            subtitle="שם העסק, תיאור, טלפון, סוגי שירותים ותגיות"
            icon="business-outline"
            onPress={() =>
              router.push('/(authenticated)/(business)/settings-business-profile')
            }
          />
          <MenuRow
            title="פרטי חשבון"
            subtitle="שם משתמש, אימייל, טלפון ויציאה מהחשבון"
            icon="person-outline"
            onPress={() =>
              router.push('/(authenticated)/(business)/settings-business-account')
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
                      justifyContent: 'space-between',
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{
                      flex: 1,
                      fontSize: 14,
                      lineHeight: 18,
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
                      width: 22,
                      height: 18,
                      marginRight: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={18} color="#2563EB" />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
