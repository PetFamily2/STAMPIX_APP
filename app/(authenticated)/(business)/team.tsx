import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'short',
  });
}

export default function BusinessTeamScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const isOwner = activeBusiness?.staffRole === 'owner';
  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const teamGate = gate('team');
  const teamCopy = getLockedAreaCopy('team', teamGate.requiredPlan);

  const staffMembers = useQuery(
    api.business.listBusinessStaff,
    activeBusinessId && entitlements && !teamGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const inviteStaff = useMutation(api.business.inviteBusinessStaff);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

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
    requiredPlan: 'starter' | 'pro' | 'premium' | null,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'feature_locked'
  ) => {
    openSubscriptionComparison(router, { featureKey, requiredPlan, reason });
  };

  const handleInvite = async () => {
    if (!activeBusinessId) {
      setInviteError('לא נמצא עסק פעיל עבור החשבון.');
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
        'team',
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
        businessId: activeBusinessId,
        email: inviteEmail.trim(),
      });
      setInviteEmail('');
      setInviteSuccess(
        result.alreadyPending
          ? `הזמנה כבר ממתינה. קוד לעובד: ${result.inviteCode}`
          : `הזמנה נוצרה. קוד לעובד: ${result.inviteCode}`
      );
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        setInviteError(entitlementErrorToHebrewMessage(entitlementError));
        openUpgrade(
          entitlementError.featureKey ?? 'team',
          entitlementError.requiredPlan ?? 'pro',
          entitlementError.code === 'SUBSCRIPTION_INACTIVE'
            ? 'subscription_inactive'
            : 'feature_locked'
        );
        return;
      }
      setInviteError(
        error instanceof Error ? error.message : 'שגיאה בשליחת ההזמנה.'
      );
    } finally {
      setIsInviting(false);
    }
  };

  const inviteSection = (
    <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
      <Text
        className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}
      >
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
        className="mt-3 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
      />
      <TouchableOpacity
        onPress={() => {
          void handleInvite();
        }}
        disabled={isInviting || !inviteEmail.trim() || !isOwner}
        className={`mt-3 rounded-2xl px-4 py-3 ${
          isInviting || !inviteEmail.trim() || !isOwner
            ? 'bg-[#CBD5E1]'
            : 'bg-[#2F6BFF]'
        }`}
      >
        {isInviting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-center text-sm font-bold text-white">
            שליחת הזמנה
          </Text>
        )}
      </TouchableOpacity>
      {inviteError ? (
        <Text className={`mt-2 text-xs text-rose-600 ${tw.textStart}`}>
          {inviteError}
        </Text>
      ) : null}
      {inviteSuccess ? (
        <Text className={`mt-2 text-xs text-emerald-600 ${tw.textStart}`}>
          {inviteSuccess}
        </Text>
      ) : null}
    </View>
  );

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
          title="צוות"
          subtitle="הזמנת עובדים וגישה משותפת לעסק"
          titleAccessory={
            <TouchableOpacity
              onPress={() =>
                router.replace('/(authenticated)/(business)/dashboard')
              }
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        <View className="mt-5">
          <FeatureGate
            isLocked={teamGate.isLocked}
            requiredPlan={teamGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'team',
                teamGate.requiredPlan,
                teamGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={teamCopy.lockedTitle}
            subtitle={teamCopy.lockedSubtitle}
            benefits={teamCopy.benefits}
          >
            {inviteSection}
          </FeatureGate>
        </View>

        <View className="mt-5">
          <FeatureGate
            isLocked={teamGate.isLocked}
            requiredPlan={teamGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'team',
                teamGate.requiredPlan,
                teamGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={teamCopy.lockedTitle}
            subtitle={teamCopy.lockedSubtitle}
          >
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text
                  className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}
                >
                  צוות פעיל
                </Text>
                <Text className="text-xs text-[#7B86A0]">
                  {teamGate.isLocked
                    ? '--'
                    : `${staffMembers?.length ?? 0} עובדים`}
                </Text>
              </View>

              {teamGate.isLocked ? (
                ['1', '2', '3'].map((id) => (
                  <View
                    key={id}
                    className="mt-3 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
                  >
                    <Text
                      className={`text-sm font-bold text-[#475569] ${tw.textStart}`}
                    >
                      עובד לדוגמה
                    </Text>
                    <Text
                      className={`mt-1 text-xs text-[#94A3B8] ${tw.textStart}`}
                    >
                      employee@example.com
                    </Text>
                  </View>
                ))
              ) : staffMembers === undefined ? (
                <ActivityIndicator color="#2F6BFF" style={{ marginTop: 16 }} />
              ) : staffMembers.length === 0 ? (
                <Text className={`mt-3 text-sm text-[#7B86A0] ${tw.textStart}`}>
                  עדיין לא נוספו עובדים לעסק.
                </Text>
              ) : (
                <View className="mt-3 gap-3">
                  {staffMembers.map((member) => (
                    <View
                      key={member.staffId}
                      className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
                    >
                      <View
                        className={`${tw.flexRow} items-start justify-between`}
                      >
                        <View className="items-end">
                          <Text
                            className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
                          >
                            {member.displayName}
                          </Text>
                          <Text
                            className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                          >
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
                      <Text
                        className={`mt-2 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        פעיל מאז {formatDate(member.createdAt)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </FeatureGate>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
