import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

const ROLE_LABEL: Record<'owner' | 'manager' | 'staff', string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  staff: 'עובד',
};

const STATUS_LABEL: Record<'active' | 'suspended' | 'removed', string> = {
  active: 'פעיל',
  suspended: 'מושעה',
  removed: 'הוסר',
};

const PERMISSION_LABELS: Record<string, string> = {
  scanner_access: 'סריקת לקוחות',
  manage_staff_only: 'ניהול עובדים (עובדים בלבד)',
  manage_business_settings: 'ניהול הגדרות עסק',
  manage_team: 'ניהול צוות מלא',
  manage_subscription: 'ניהול מנוי וחיוב',
};

type MyBusinessMembershipRow = {
  staffId: string;
  businessId: string;
  businessName: string;
  staffRole: 'owner' | 'manager' | 'staff';
  status: 'active' | 'suspended' | 'removed';
};

export default function StaffSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setAppMode } = useAppMode();
  const setActiveMode = useMutation(api.users.setActiveMode);
  const {
    activeBusinessId,
    activeBusiness,
    businesses,
    isSwitchingBusiness,
    setActiveBusinessId,
  } = useActiveBusiness();

  const profile = useQuery(
    api.business.getMyStaffProfileForBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const myMemberships =
    (useQuery(api.business.getMyBusinessMemberships, {}) as
      | MyBusinessMembershipRow[]
      | undefined) ?? [];

  const [busyBusinessId, setBusyBusinessId] = useState<string | null>(null);
  const canOpenBusinessShell =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';

  const permissionLabels = useMemo(
    () =>
      (profile?.permissions ?? []).map(
        (permission: string) => PERMISSION_LABELS[permission] ?? permission
      ),
    [profile?.permissions]
  );

  const switchBusiness = async (businessId: string) => {
    if (busyBusinessId || isSwitchingBusiness) {
      return;
    }
    setBusyBusinessId(businessId);
    try {
      await setActiveBusinessId(businessId as any);
    } finally {
      setBusyBusinessId(null);
    }
  };

  const goToPrivateArea = async () => {
    await setActiveMode({ mode: 'customer' });
    await setAppMode('customer');
    router.replace('/(authenticated)/(customer)/wallet');
  };

  const goToBusinessShell = async () => {
    await setActiveMode({ mode: 'business' });
    await setAppMode('business');
    if (canOpenBusinessShell) {
      router.replace('/(authenticated)/(business)/dashboard');
      return;
    }
    router.replace('/(authenticated)/(staff)/scanner');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 32,
          gap: 12,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="הגדרות צוות"
            subtitle="פרופיל עובד, הרשאות ועסק פעיל"
          />
        </StickyScrollHeader>

        <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            פרופיל בעסק פעיל
          </Text>
          {profile === undefined ? (
            <ActivityIndicator color="#2F6BFF" style={{ marginTop: 12 }} />
          ) : profile ? (
            <View className="mt-3 gap-2">
              <Text
                className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
              >
                עסק: {profile.businessName}
              </Text>
              <Text className={`text-sm text-[#475569] ${tw.textStart}`}>
                תפקיד: {ROLE_LABEL[profile.staffRole]}
              </Text>
              <Text className={`text-sm text-[#475569] ${tw.textStart}`}>
                סטטוס: {STATUS_LABEL[profile.status]}
              </Text>
            </View>
          ) : (
            <Text className={`mt-3 text-sm text-[#64748B] ${tw.textStart}`}>
              לא נמצא פרופיל עובד לעסק הפעיל.
            </Text>
          )}
        </View>

        <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            ההרשאות שלי
          </Text>
          <View className="mt-3 gap-2">
            {permissionLabels.length === 0 ? (
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                אין הרשאות להצגה.
              </Text>
            ) : (
              permissionLabels.map((permission) => (
                <View
                  key={permission}
                  className="rounded-xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-2"
                >
                  <Text
                    className={`text-xs font-semibold text-[#334155] ${tw.textStart}`}
                  >
                    {permission}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            מעבר בין עסקים
          </Text>
          <View className="mt-3 gap-2">
            {myMemberships.length === 0 ? (
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                אין עסקים זמינים.
              </Text>
            ) : (
              myMemberships.map((membership) => {
                const isActive = membership.businessId === activeBusinessId;
                const isBusy = busyBusinessId === membership.businessId;
                return (
                  <TouchableOpacity
                    key={membership.staffId}
                    onPress={() => {
                      void switchBusiness(membership.businessId);
                    }}
                    disabled={isBusy || isSwitchingBusiness || isActive}
                    className={`rounded-xl border px-3 py-3 ${
                      isActive
                        ? 'border-[#A9C7FF] bg-[#EFF4FF]'
                        : 'border-[#E3E9FF] bg-[#F8FAFF]'
                    } ${isBusy ? 'opacity-60' : ''}`}
                  >
                    <View
                      className={`${tw.flexRow} items-center justify-between`}
                    >
                      <View className="items-end">
                        <Text
                          className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {membership.businessName}
                        </Text>
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          {ROLE_LABEL[membership.staffRole]} ·{' '}
                          {STATUS_LABEL[membership.status]}
                        </Text>
                      </View>
                      {isBusy ? <ActivityIndicator color="#2F6BFF" /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            מצב אפליקציה
          </Text>

          <TouchableOpacity
            onPress={() => {
              void goToBusinessShell();
            }}
            className="mt-3 rounded-2xl border border-[#D6E3FF] bg-[#EFF4FF] px-4 py-3"
          >
            <Text className="text-center text-sm font-bold text-[#1D4ED8]">
              מעבר למצב עסק
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              void goToPrivateArea();
            }}
            className="mt-3 rounded-2xl border border-[#D6E3FF] bg-white px-4 py-3"
          >
            <Text className="text-center text-sm font-bold text-[#1D4ED8]">
              מעבר לאזור פרטי
            </Text>
          </TouchableOpacity>
        </View>

        <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            הסורק
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(authenticated)/(staff)/scanner')}
            className="mt-3 rounded-2xl bg-[#2F6BFF] px-4 py-3"
          >
            <Text className="text-center text-sm font-bold text-white">
              חזרה לסורק
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
