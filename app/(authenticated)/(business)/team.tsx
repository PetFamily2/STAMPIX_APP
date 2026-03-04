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
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'short',
  });

export default function BusinessTeamScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.businessId === selectedBusinessId),
    [businesses, selectedBusinessId]
  );
  const isOwner = selectedBusiness?.staffRole === 'owner';

  const { entitlements, gate } = useEntitlements(selectedBusinessId);
  const teamGate = gate('canManageTeam');

  const staffMembers = useQuery(
    api.business.listBusinessStaff,
    selectedBusinessId && entitlements && !teamGate.isLocked
      ? { businessId: selectedBusinessId }
      : 'skip'
  );
  const inviteStaff = useMutation(api.business.inviteBusinessStaff);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
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

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'unlimited' | null,
    reason: 'feature_locked' | 'limit_reached' | 'subscription_inactive' = 'feature_locked'
  ) => {
    setUpgradeFeatureKey(featureKey);
    setUpgradePlan(requiredPlan === 'unlimited' ? 'unlimited' : 'pro');
    setUpgradeReason(reason);
    setIsUpgradeVisible(true);
  };

  const handleInvite = async () => {
    if (!selectedBusinessId) {
      setInviteError('בחרו עסק לפני שליחת הזמנה.');
      return;
    }
    if (!inviteEmail.trim()) {
      setInviteError('הזינו כתובת אימייל תקינה.');
      return;
    }
    if (!isOwner) {
      setInviteError('רק בעל העסק יכול להזמין עובדים.');
      return;
    }
    if (teamGate.isLocked) {
      openUpgrade(
        'canManageTeam',
        teamGate.requiredPlan,
        teamGate.reason === 'subscription_inactive'
          ? 'subscription_inactive'
          : 'feature_locked'
      );
      return;
    }

    setInviteError(null);
    setInviteSuccess(null);
    setIsInviting(true);
    try {
      const result = await inviteStaff({
        businessId: selectedBusinessId,
        email: inviteEmail.trim(),
      });

      setInviteEmail('');
      setInviteSuccess(
        result.alreadyPending
          ? `הזמנה ממתינה כבר נשלחה. קוד: ${result.inviteCode}`
          : `ההזמנה נוצרה. קוד לעובד: ${result.inviteCode}`
      );
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        setInviteError(entitlementErrorToHebrewMessage(entitlementError));
        openUpgrade(
          entitlementError.featureKey ?? 'canManageTeam',
          entitlementError.requiredPlan ?? 'pro',
          entitlementError.code === 'SUBSCRIPTION_INACTIVE'
            ? 'subscription_inactive'
            : 'feature_locked'
        );
        return;
      }

      setInviteError((error as Error).message ?? 'שגיאה בשליחת הזמנה.');
    } finally {
      setIsInviting(false);
    }
  };

  const inviteSection = (
    <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 space-y-3">
      <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
        הזמנת עובד חדש
      </Text>
      <TextInput
        value={inviteEmail}
        onChangeText={(value) => {
          setInviteEmail(value);
          if (inviteError) {
            setInviteError(null);
          }
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="אימייל העובד"
        placeholderTextColor="#94A3B8"
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
      />
      <TouchableOpacity
        onPress={() => {
          void handleInvite();
        }}
        disabled={isInviting || !inviteEmail.trim() || !isOwner}
        className={`rounded-2xl px-4 py-3 ${
          isInviting || !inviteEmail.trim() || !isOwner
            ? 'bg-[#CBD5E1]'
            : 'bg-[#2F6BFF]'
        }`}
      >
        {isInviting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-center text-sm font-bold text-white">שליחת הזמנה</Text>
        )}
      </TouchableOpacity>
      {inviteError ? (
        <Text className={`text-xs text-rose-600 ${tw.textStart}`}>{inviteError}</Text>
      ) : null}
      {inviteSuccess ? (
        <Text className={`text-xs text-emerald-600 ${tw.textStart}`}>{inviteSuccess}</Text>
      ) : null}
    </View>
  );

  const placeholderRows = Array.from({ length: 3 }, (_, index) => (
    <View
      key={`placeholder-${index}`}
      className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
    >
      <Text className={`text-sm font-bold text-[#475569] ${tw.textStart}`}>עובד לדוגמה</Text>
      <Text className={`mt-1 text-xs text-[#94A3B8] ${tw.textStart}`}>employee@example.com</Text>
    </View>
  ));

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 32,
        }}
      >
        <BusinessScreenHeader
          title="ניהול צוות"
          subtitle="הזמנת עובדים וניהול הרשאות"
          titleAccessory={
            <TouchableOpacity
              onPress={() => router.replace('/(authenticated)/(business)/dashboard')}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 space-y-3">
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
                  <Text className="text-right text-sm font-semibold text-[#1A2B4A]">
                    {business.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={teamGate.isLocked}
            requiredPlan={teamGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canManageTeam',
                teamGate.requiredPlan,
                teamGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="ניהול עובדים נעול"
            subtitle="ניהול צוות והרשאות זמינים במסלול Pro ומעלה."
            benefits={[
              'הזמנת עובדים וקביעת תפקידים',
              'ניהול הרשאות לפי תפקיד',
              'מעקב אחר פעילות צוות',
            ]}
          >
            {inviteSection}
          </LockedFeatureWrapper>
        </View>

        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={teamGate.isLocked}
            requiredPlan={teamGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canManageTeam',
                teamGate.requiredPlan,
                teamGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="רשימת צוות נעולה"
            subtitle="צפייה בעובדים פעילים זמינה במסלול Pro ומעלה."
          >
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 space-y-3">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
                  צוות פעיל
                </Text>
                <Text className="text-xs text-[#7B86A0]">
                  {teamGate.isLocked
                    ? '--'
                    : `${staffMembers?.length ?? 0} עובדים`}
                </Text>
              </View>

              {teamGate.isLocked ? (
                placeholderRows
              ) : staffMembers === undefined ? (
                <ActivityIndicator color="#2F6BFF" />
              ) : staffMembers.length === 0 ? (
                <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
                  עדיין לא נוספו עובדים לעסק זה.
                </Text>
              ) : (
                staffMembers.map((member) => (
                  <View
                    key={member.staffId}
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
                  >
                    <View className={`${tw.flexRow} items-start justify-between`}>
                      <View className="items-end">
                        <Text className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}>
                          {member.displayName}
                        </Text>
                        <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                          {member.email ?? 'ללא אימייל'}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#5B6475]">
                          {member.staffRole === 'owner' ? 'בעלים' : 'עובד'}
                        </Text>
                        <Text className="mt-1 text-[11px] text-[#64748B]">
                          {member.role ?? 'ללא תפקיד'}
                        </Text>
                      </View>
                    </View>
                    <Text className={`mt-2 text-xs text-[#64748B] ${tw.textStart}`}>
                      פעיל מאז {formatDate(member.createdAt)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </LockedFeatureWrapper>
        </View>
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={selectedBusinessId}
        initialPlan={upgradePlan}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
        onSuccess={() => {
          Alert.alert('עודכן', 'ניהול הצוות נפתח לעסק שנבחר.');
        }}
      />
    </SafeAreaView>
  );
}
