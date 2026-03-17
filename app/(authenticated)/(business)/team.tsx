import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import StickyScrollHeader from '@/components/StickyScrollHeader';
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

type InviteTargetRole = 'manager' | 'staff';

type StaffRow = {
  staffId: string;
  userId: string;
  staffRole: 'owner' | 'manager' | 'staff';
  status: 'active' | 'suspended' | 'removed';
  joinedAt: number;
  displayName: string;
  email: string | null;
  isSelf: boolean;
};

type PendingInviteRow = {
  inviteId: string;
  invitedEmail: string;
  targetRole: InviteTargetRole;
  expiresAt: number;
  createdAt: number;
};

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

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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
  const isManager = activeBusiness?.staffRole === 'manager';
  const canManageTeam = isOwner || isManager;

  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const teamGate = gate('team');
  const teamCopy = getLockedAreaCopy('team', teamGate.requiredPlan);

  const queryArgs =
    activeBusinessId && entitlements && !teamGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip';

  const staffMembers =
    (useQuery(api.business.listBusinessStaff, queryArgs) as
      | StaffRow[]
      | undefined) ?? [];
  const pendingInvites =
    (useQuery(api.business.listPendingStaffInvites, queryArgs) as
      | PendingInviteRow[]
      | undefined) ?? [];
  const summary = useQuery(api.business.getBusinessTeamSummary, queryArgs);

  const inviteStaff = useMutation(api.business.inviteBusinessStaff);
  const cancelInvite = useMutation(api.business.cancelStaffInvite);
  const updateRole = useMutation(api.business.updateBusinessStaffRole);
  const suspendStaff = useMutation(api.business.suspendBusinessStaff);
  const reactivateStaff = useMutation(api.business.reactivateBusinessStaff);
  const removeStaff = useMutation(api.business.removeBusinessStaff);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteTargetRole>('staff');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  useEffect(() => {
    if (!isOwner) {
      setInviteRole('staff');
    }
  }, [isOwner]);

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

  const handleMutationError = (error: unknown) => {
    const entitlementError = getEntitlementError(error);
    if (entitlementError) {
      setInviteError(entitlementErrorToHebrewMessage(entitlementError));
      openUpgrade(
        entitlementError.featureKey ?? 'team',
        entitlementError.requiredPlan ?? 'pro',
        entitlementError.code === 'SUBSCRIPTION_INACTIVE'
          ? 'subscription_inactive'
          : entitlementError.code === 'PLAN_LIMIT_REACHED'
            ? 'limit_reached'
            : 'feature_locked'
      );
      return;
    }

    setInviteError(error instanceof Error ? error.message : 'אירעה שגיאה.');
  };

  const handleInvite = async () => {
    if (!activeBusinessId) {
      setInviteError('לא נבחר עסק פעיל.');
      return;
    }
    if (!inviteEmail.trim()) {
      setInviteError('יש להזין אימייל תקין.');
      return;
    }
    if (!canManageTeam) {
      setInviteError('אין הרשאה לניהול צוות.');
      return;
    }

    setInviteError(null);
    setInviteSuccess(null);
    setIsInviting(true);

    try {
      const result = await inviteStaff({
        businessId: activeBusinessId,
        email: inviteEmail.trim(),
        role: isOwner ? inviteRole : 'staff',
      });
      setInviteEmail('');
      setInviteSuccess(`הזמנה נוצרה. קוד הזמנה: ${result.inviteCode}`);
    } catch (error) {
      handleMutationError(error);
    } finally {
      setIsInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!activeBusinessId || busyInviteId || busyMemberId) {
      return;
    }
    setInviteError(null);
    setBusyInviteId(inviteId);
    try {
      await cancelInvite({
        businessId: activeBusinessId,
        inviteId: inviteId as any,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleChangeRole = async (
    staffId: string,
    role: 'manager' | 'staff'
  ) => {
    if (!activeBusinessId || busyMemberId || busyInviteId) {
      return;
    }
    setInviteError(null);
    setBusyMemberId(staffId);
    try {
      await updateRole({
        businessId: activeBusinessId,
        staffId: staffId as any,
        role,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleSuspend = async (staffId: string) => {
    if (!activeBusinessId || busyMemberId || busyInviteId) {
      return;
    }
    setInviteError(null);
    setBusyMemberId(staffId);
    try {
      await suspendStaff({
        businessId: activeBusinessId,
        staffId: staffId as any,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleReactivate = async (staffId: string) => {
    if (!activeBusinessId || busyMemberId || busyInviteId) {
      return;
    }
    setInviteError(null);
    setBusyMemberId(staffId);
    try {
      await reactivateStaff({
        businessId: activeBusinessId,
        staffId: staffId as any,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemove = async (staffId: string) => {
    if (!activeBusinessId || busyMemberId || busyInviteId) {
      return;
    }
    setInviteError(null);
    setBusyMemberId(staffId);
    try {
      await removeStaff({
        businessId: activeBusinessId,
        staffId: staffId as any,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyMemberId(null);
    }
  };

  const activeRows = useMemo(
    () =>
      staffMembers.filter(
        (row) => row.status === 'active' && row.staffRole !== 'owner'
      ),
    [staffMembers]
  );
  const suspendedRows = useMemo(
    () => staffMembers.filter((row) => row.status === 'suspended'),
    [staffMembers]
  );

  const renderActionButton = (
    label: string,
    onPress: () => void,
    tone: 'neutral' | 'danger' | 'success' = 'neutral',
    disabled = false
  ) => {
    const toneClass =
      tone === 'danger'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-[#D6E3FF] bg-[#EFF4FF] text-[#1D4ED8]';

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        className={`rounded-xl border px-3 py-2 ${toneClass} ${disabled ? 'opacity-50' : ''}`}
      >
        <Text className="text-xs font-bold">{label}</Text>
      </TouchableOpacity>
    );
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
            title="צוות"
            subtitle="ניהול עובדים והרשאות בעסק הפעיל"
            titleAccessory={
              <TouchableOpacity
                onPress={() =>
                  router.replace('/(authenticated)/(business)/dashboard')
                }
                className="h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                <Text className="text-lg text-[#1A2B4A]">?</Text>
              </TouchableOpacity>
            }
          />
        </StickyScrollHeader>

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
          <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              סטטוס צוות
            </Text>
            <View className="mt-3 flex-row-reverse flex-wrap gap-2">
              <View className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-2">
                <Text className="text-[11px] text-[#64748B]">
                  עובדים פעילים
                </Text>
                <Text className="text-base font-extrabold text-[#1A2B4A]">
                  {summary?.activeStaffCount ?? '--'}
                </Text>
              </View>
              <View className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-2">
                <Text className="text-[11px] text-[#64748B]">
                  הזמנות ממתינות
                </Text>
                <Text className="text-base font-extrabold text-[#1A2B4A]">
                  {summary?.pendingInvitesCount ?? '--'}
                </Text>
              </View>
              <View className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-2">
                <Text className="text-[11px] text-[#64748B]">מושעים</Text>
                <Text className="text-base font-extrabold text-[#1A2B4A]">
                  {summary?.suspendedCount ?? '--'}
                </Text>
              </View>
              {isOwner ? (
                <View className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-2">
                  <Text className="text-[11px] text-[#64748B]">מנהלים</Text>
                  <Text className="text-base font-extrabold text-[#1A2B4A]">
                    {summary?.managersCount ?? '--'}
                  </Text>
                </View>
              ) : null}
              <View className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-2">
                <Text className="text-[11px] text-[#64748B]">מושבים</Text>
                <Text className="text-base font-extrabold text-[#1A2B4A]">
                  {summary ? `${summary.usedSeats}/${summary.maxSeats}` : '--'}
                </Text>
              </View>
            </View>
          </View>

          <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              הזמנת עובד
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
              placeholder="אימייל עובד"
              placeholderTextColor="#94A3B8"
              className="mt-3 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
            />

            {isOwner ? (
              <View className="mt-3 flex-row-reverse gap-2">
                <TouchableOpacity
                  onPress={() => setInviteRole('staff')}
                  className={`rounded-xl border px-3 py-2 ${
                    inviteRole === 'staff'
                      ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                      : 'border-[#D6E3FF] bg-white'
                  }`}
                >
                  <Text className="text-xs font-bold text-[#1D4ED8]">עובד</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setInviteRole('manager')}
                  className={`rounded-xl border px-3 py-2 ${
                    inviteRole === 'manager'
                      ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                      : 'border-[#D6E3FF] bg-white'
                  }`}
                >
                  <Text className="text-xs font-bold text-[#1D4ED8]">מנהל</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => {
                void handleInvite();
              }}
              disabled={isInviting || !inviteEmail.trim() || !canManageTeam}
              className={`mt-3 rounded-2xl px-4 py-3 ${
                isInviting || !inviteEmail.trim() || !canManageTeam
                  ? 'bg-[#CBD5E1]'
                  : 'bg-[#2F6BFF]'
              }`}
            >
              {isInviting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-sm font-bold text-white">
                  צור הזמנה
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

          <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              פעילים
            </Text>
            <View className="mt-3 gap-3">
              {activeRows.length === 0 ? (
                <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                  אין עובדים פעילים.
                </Text>
              ) : (
                activeRows.map((member) => (
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
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          הצטרף ב-{formatDate(member.joinedAt)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[11px] font-semibold text-[#64748B]">
                          {ROLE_LABEL[member.staffRole]}
                        </Text>
                        <Text className="mt-1 text-[11px] text-[#64748B]">
                          {STATUS_LABEL[member.status]}
                        </Text>
                      </View>
                    </View>

                    {member.status !== 'removed' && !member.isSelf ? (
                      <View className="mt-3 flex-row-reverse flex-wrap gap-2">
                        {isOwner && member.staffRole === 'staff'
                          ? renderActionButton(
                              'קדם למנהל',
                              () => {
                                void handleChangeRole(
                                  member.staffId,
                                  'manager'
                                );
                              },
                              'neutral',
                              busyMemberId === member.staffId
                            )
                          : null}
                        {isOwner && member.staffRole === 'manager'
                          ? renderActionButton(
                              'הפוך לעובד',
                              () => {
                                void handleChangeRole(member.staffId, 'staff');
                              },
                              'neutral',
                              busyMemberId === member.staffId
                            )
                          : null}

                        {renderActionButton(
                          'השהה',
                          () => {
                            void handleSuspend(member.staffId);
                          },
                          'danger',
                          busyMemberId === member.staffId
                        )}

                        {renderActionButton(
                          'הסר',
                          () => {
                            void handleRemove(member.staffId);
                          },
                          'danger',
                          busyMemberId === member.staffId
                        )}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </View>

          <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              הזמנות ממתינות
            </Text>
            <View className="mt-3 gap-3">
              {pendingInvites.length === 0 ? (
                <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                  אין הזמנות ממתינות.
                </Text>
              ) : (
                pendingInvites.map((invite) => (
                  <View
                    key={invite.inviteId}
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
                  >
                    <View
                      className={`${tw.flexRow} items-start justify-between`}
                    >
                      <View className="items-end">
                        <Text
                          className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {invite.invitedEmail}
                        </Text>
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          תפקיד:{' '}
                          {invite.targetRole === 'manager' ? 'מנהל' : 'עובד'}
                        </Text>
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          פג תוקף: {formatDate(invite.expiresAt)}
                        </Text>
                      </View>

                      {renderActionButton(
                        'בטל הזמנה',
                        () => {
                          void handleCancelInvite(invite.inviteId);
                        },
                        'danger',
                        busyInviteId === invite.inviteId
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View className="rounded-3xl border border-[#DCE6FF] bg-white p-4">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              מושעים
            </Text>
            <View className="mt-3 gap-3">
              {suspendedRows.length === 0 ? (
                <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                  אין עובדים מושעים.
                </Text>
              ) : (
                suspendedRows.map((member) => (
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
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          {ROLE_LABEL[member.staffRole]}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[11px] font-semibold text-[#64748B]">
                          {STATUS_LABEL[member.status]}
                        </Text>
                      </View>
                    </View>

                    {!member.isSelf ? (
                      <View className="mt-3 flex-row-reverse flex-wrap gap-2">
                        {renderActionButton(
                          'הפעל מחדש',
                          () => {
                            void handleReactivate(member.staffId);
                          },
                          'success',
                          busyMemberId === member.staffId
                        )}

                        {renderActionButton(
                          'הסר',
                          () => {
                            void handleRemove(member.staffId);
                          },
                          'danger',
                          busyMemberId === member.staffId
                        )}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </View>
        </FeatureGate>
      </ScrollView>
    </SafeAreaView>
  );
}
