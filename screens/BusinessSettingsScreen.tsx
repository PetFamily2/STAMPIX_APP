import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  AddBusinessCta,
  LogoutOptionsSheet,
  ProfileCompletionCard,
  SettingsGroup,
  SettingsNavRow,
  SettingsSection,
} from '@/components/business-settings';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { parseMissingProfileFields } from '@/lib/businessSettings/completion';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { getBusinessOnboardingEntryRoute } from '@/lib/onboarding/businessOnboardingFlow';
import { alignItems, flexDirection, tw } from '@/lib/rtl';
import { useAuthActions } from '@convex-dev/auth/react';

export default function BusinessSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const sessionContext = useSessionContext();
  const {
    businesses,
    activeBusiness,
    activeBusinessId,
    isLoading,
    isSwitchingBusiness,
    setActiveBusinessId,
  } = useActiveBusiness();
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canEditBusiness =
    activeBusinessCapabilities?.edit_business_profile === true;
  const canManageTeam = activeBusinessCapabilities?.manage_team === true;
  const canInviteBusinesses =
    activeBusinessCapabilities?.invite_businesses === true;
  const canManageSubscription =
    activeBusinessCapabilities?.manage_subscription === true;
  const addBusinessRoute = getBusinessOnboardingEntryRoute(
    sessionContext?.user.businessOnboardedAt != null
  );
  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );

  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [isLogoutSheetVisible, setIsLogoutSheetVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const missingFields = parseMissingProfileFields(
    businessSettings?.profileCompletion?.missingFields
  );
  const showCompletionCard =
    businessSettings?.profileCompletion != null &&
    businessSettings.profileCompletion.isComplete !== true &&
    missingFields.length > 0;

  const openAddBusiness = () => {
    router.push(addBusinessRoute as Href);
  };

  const handleLogoutDevice = () => {
    if (isSigningOut) {
      return;
    }
    Alert.alert('התנתקות מהמכשיר?', 'תצאו מהחשבון במכשיר זה בלבד.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתקות',
        style: 'destructive',
        onPress: async () => {
          if (isSigningOut) {
            return;
          }
          setIsSigningOut(true);
          try {
            await signOut();
            router.replace('/(auth)/sign-in');
          } catch {
            Alert.alert('שגיאה', 'לא הצלחנו לבצע יציאה. נסו שוב.');
          } finally {
            setIsSigningOut(false);
            setIsLogoutSheetVisible(false);
          }
        },
      },
    ]);
  };

  const handleCancelSubscription = () => {
    setIsLogoutSheetVisible(false);
    router.push(BUSINESS_ROUTES.subscription as Href);
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F5F7FB]">
        <ActivityIndicator color="#2F6BFF" />
      </SafeAreaView>
    );
  }

  if (businesses.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-[#F5F7FB]" edges={[]}>
        <ScrollView
          stickyHeaderIndices={[0]}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 24,
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
          }}
        >
          <StickyScrollHeader
            topPadding={(insets.top || 0) + 12}
            backgroundColor="#F5F7FB"
          >
            <BusinessScreenHeader title="הגדרות עסק" />
          </StickyScrollHeader>
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
              onPress={() => router.push(addBusinessRoute as Href)}
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
    <SafeAreaView className="flex-1 bg-[#F5F7FB]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 12,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#F5F7FB"
        >
          <BusinessScreenHeader title="הגדרות עסק" />
        </StickyScrollHeader>

        <BusinessModeCtaCard accentButton={true} />

        <View className="mt-1">
          <Pressable
            onPress={() => setIsPickerVisible(true)}
            disabled={isSwitchingBusiness}
            accessibilityRole="button"
            accessibilityLabel={`עסק פעיל, ${activeBusiness?.name ?? 'בחר עסק'}`}
            accessibilityHint="בחירת עסק פעיל"
            accessibilityState={{
              disabled: isSwitchingBusiness,
              expanded: isPickerVisible,
            }}
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
                flexDirection: flexDirection.row,
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View
                style={{
                  flex: 1,
                  alignItems: alignItems.start,
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

        <AddBusinessCta onPress={openAddBusiness} />

        {showCompletionCard ? (
          <ProfileCompletionCard
            missingCount={missingFields.length}
            canEdit={canEditBusiness}
            onPress={() =>
              router.push(BUSINESS_ROUTES.profileComplete as Href)
            }
          />
        ) : null}

        <SettingsSection title="העסק">
          <SettingsGroup>
            <SettingsNavRow
              title="פרטי העסק"
              subtitle="שם, כתובת, שירותים והעדפות"
              icon="storefront-outline"
              onPress={() => router.push(BUSINESS_ROUTES.profile as Href)}
              isLast={!canManageTeam && !canInviteBusinesses}
            />
            {canManageTeam ? (
              <SettingsNavRow
                title="צוות והרשאות"
                subtitle="עובדים, הזמנות והרשאות"
                icon="people-outline"
                onPress={() => router.push(BUSINESS_ROUTES.team)}
                isLast={!canInviteBusinesses}
              />
            ) : null}
            {canInviteBusinesses ? (
              <SettingsNavRow
                title="הזמנת עסקים"
                subtitle="הזמינו עסקים. צברו חודשי StampAix."
                icon="share-social-outline"
                onPress={() =>
                  router.push(BUSINESS_ROUTES.inviteBusinesses as Href)
                }
                isLast={true}
              />
            ) : null}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="החשבון">
          <SettingsGroup>
            <SettingsNavRow
              title="פרטי חשבון"
              subtitle="שם, אימייל ומסמכים"
              icon="person-outline"
              onPress={() => router.push(BUSINESS_ROUTES.account as Href)}
              isLast={true}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title="אפשרויות נוספות">
          <SettingsGroup>
            <SettingsNavRow
              title="התנתקות"
              subtitle="יציאה מהמכשיר או ניהול המנוי"
              icon="log-out-outline"
              onPress={() => setIsLogoutSheetVisible(true)}
              isLast={true}
            />
          </SettingsGroup>
        </SettingsSection>
      </ScrollView>

      <LogoutOptionsSheet
        visible={isLogoutSheetVisible}
        onClose={() => setIsLogoutSheetVisible(false)}
        onLogoutDevice={handleLogoutDevice}
        onCancelSubscription={
          canManageSubscription ? handleCancelSubscription : undefined
        }
        showCancelSubscription={canManageSubscription}
      />

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
                    accessibilityRole="button"
                    accessibilityLabel={business.name}
                    accessibilityState={{ selected: isActive }}
                    style={({ pressed }) => [
                      {
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isActive ? '#A9C7FF' : '#E3E9FF',
                        backgroundColor: isActive ? '#EAF1FF' : '#FFFFFF',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        opacity: pressed ? 0.86 : 1,
                        flexDirection: flexDirection.row,
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
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
