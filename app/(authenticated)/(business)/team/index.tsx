import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { BarComparisonChart, KpiCard } from '@/components/business-ui';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { mapTeamInviteErrorToMessage } from '@/lib/domain/teamInviteErrors';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type InviteTargetRole = 'manager' | 'staff';

type StaffRole = 'owner' | 'manager' | 'staff';
type StaffStatus = 'active' | 'suspended' | 'removed';
type InviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';

type StaffRow = {
  staffId: string;
  userId: string;
  staffRole: StaffRole;
  status: StaffStatus;
  joinedAt: number;
  removedAt: number | null;
  displayName: string;
  phone: string | null;
  email: string | null;
  isSelf: boolean;
};

type TeamInviteRow = {
  inviteId: string;
  invitedEmail: string;
  invitedUserId: string | null;
  invitedDisplayName: string | null;
  invitedPhone: string | null;
  invitedResolvedEmail: string | null;
  invitedByDisplayName?: string;
  targetRole: InviteTargetRole;
  status: InviteStatus;
  expiresAt: number;
  createdAt: number;
  acceptedAt?: number | null;
  cancelledAt?: number | null;
  resolvedAt?: number | null;
};

type TeamSummary = {
  activeStaffCount: number;
  pendingInvitesCount: number;
  suspendedCount: number;
  managersCount: number;
  usedSeats: number;
  maxSeats: number;
};

type TeamHistoryRow = {
  eventId: string;
  eventType:
    | 'invite_created'
    | 'invite_cancelled'
    | 'invite_accepted'
    | 'invite_expired'
    | 'role_changed'
    | 'suspended'
    | 'reactivated'
    | 'removed'
    | 'auto_disabled_by_plan'
    | 'auto_invites_cancelled_by_plan'
    | 'reinvited_after_removal';
  actorUserId: string | null;
  actorDisplayName: string | null;
  targetUserId: string | null;
  targetDisplayName: string | null;
  targetPhone: string | null;
  targetEmail: string | null;
  targetInviteId: string | null;
  inviteCode: string | null;
  inviteTargetRole: InviteTargetRole | null;
  fromRole: StaffRole | null;
  toRole: StaffRole | null;
  fromStatus: StaffStatus | null;
  toStatus: StaffStatus | null;
  reasonCode: string | null;
  createdAt: number;
};

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  staff: 'עובד',
};

const STATUS_LABEL: Record<StaffStatus, string> = {
  active: 'פעיל',
  suspended: 'מושעה',
  removed: 'הוסר',
};

const EVENT_LABEL: Record<TeamHistoryRow['eventType'], string> = {
  invite_created: 'הזמנה נשלחה',
  invite_cancelled: 'הזמנה בוטלה',
  invite_accepted: 'הזמנה התקבלה',
  invite_expired: 'הזמנה פגה',
  role_changed: 'תפקיד עודכן',
  suspended: 'חברות הושעתה',
  reactivated: 'חברות חודשה',
  removed: 'עובד הוסר',
  auto_disabled_by_plan: 'הושעה עקב חבילה',
  auto_invites_cancelled_by_plan: 'הזמנות בוטלו',
  reinvited_after_removal: 'הוזמן מחדש',
};

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeHistoryEvent(row: TeamHistoryRow) {
  switch (row.eventType) {
    case 'invite_created': {
      const role = row.toRole ?? row.inviteTargetRole;
      return role
        ? `נשלחה הזמנה לתפקיד ${ROLE_LABEL[role]}`
        : 'נשלחה הזמנה חדשה.';
    }
    case 'invite_cancelled':
      return 'ההזמנה בוטלה.';
    case 'invite_accepted': {
      const role = row.toRole ?? row.inviteTargetRole;
      return role
        ? `ההזמנה התקבלה לתפקיד ${ROLE_LABEL[role]}`
        : 'ההזמנה התקבלה.';
    }
    case 'invite_expired':
      return 'תוקף ההזמנה פג לפני שהיא התקבלה.';
    case 'role_changed': {
      if (row.fromRole && row.toRole) {
        return `התפקיד שונה מ-${ROLE_LABEL[row.fromRole]} ל-${ROLE_LABEL[row.toRole]}`;
      }
      return 'התפקיד עודכן.';
    }
    case 'suspended':
      return 'חברות העובד בצוות הושעתה.';
    case 'reactivated':
      return 'חברות העובד הופעלה מחדש.';
    case 'removed':
      return 'העובד הוסר מהצוות.';
    case 'reinvited_after_removal': {
      if (row.fromRole && row.toRole) {
        return `הוזמן מחדש: מ-${ROLE_LABEL[row.fromRole]} ל-${ROLE_LABEL[row.toRole]}`;
      }
      return 'העובד הוזמן מחדש לאחר הסרה.';
    }
    case 'auto_disabled_by_plan':
      return 'הגישה הושעתה בגלל מגבלת החבילה.';
    case 'auto_invites_cancelled_by_plan':
      return 'הזמנות ממתינות בוטלו בגלל מגבלת החבילה.';
    default:
      return 'נרשמה פעילות צוות.';
  }
}

export default function BusinessTeamManagementScreen() {
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
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canManageTeam = activeBusinessCapabilities?.manage_team === true;

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
      | TeamInviteRow[]
      | undefined) ?? [];
  const closedInvites =
    (useQuery(
      api.business.listClosedStaffInvites,
      queryArgs === 'skip' ? 'skip' : { ...queryArgs, limit: 50 }
    ) as TeamInviteRow[] | undefined) ?? [];
  const summary = useQuery(api.business.getBusinessTeamSummary, queryArgs) as
    | TeamSummary
    | null
    | undefined;
  const history =
    (useQuery(
      api.business.listBusinessStaffHistory,
      queryArgs === 'skip' ? 'skip' : { ...queryArgs, limit: 50 }
    ) as TeamHistoryRow[] | undefined) ?? [];

  const cancelInvite = useMutation(api.business.cancelStaffInvite);
  const updateRole = useMutation(api.business.updateBusinessStaffRole);
  const suspendStaff = useMutation(api.business.suspendBusinessStaff);
  const reactivateStaff = useMutation(api.business.reactivateBusinessStaff);
  const removeStaff = useMutation(api.business.removeBusinessStaff);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [isActiveExpanded, setIsActiveExpanded] = useState(true);
  const [isSuspendedExpanded, setIsSuspendedExpanded] = useState(false);
  const [isRemovedExpanded, setIsRemovedExpanded] = useState(false);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);
  const [isPendingExpanded, setIsPendingExpanded] = useState(false);
  const [isClosedExpanded, setIsClosedExpanded] = useState(false);

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

    const mappedErrorMessage = mapTeamInviteErrorToMessage(error);
    if (mappedErrorMessage) {
      setInviteError(mappedErrorMessage);
      return;
    }

    setInviteError('שגיאה כללית.');
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
        inviteId: inviteId as never,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleChangeRole = async (staffId: string, role: InviteTargetRole) => {
    if (!activeBusinessId || busyMemberId || busyInviteId) {
      return;
    }
    setInviteError(null);
    setBusyMemberId(staffId);
    try {
      await updateRole({
        businessId: activeBusinessId,
        staffId: staffId as never,
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
        staffId: staffId as never,
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
        staffId: staffId as never,
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
        staffId: staffId as never,
      });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusyMemberId(null);
    }
  };

  const activeRows = useMemo(
    () => staffMembers.filter((row) => row.status === 'active'),
    [staffMembers]
  );
  const suspendedRows = useMemo(
    () => staffMembers.filter((row) => row.status === 'suspended'),
    [staffMembers]
  );
  const removedRows = useMemo(
    () => staffMembers.filter((row) => row.status === 'removed'),
    [staffMembers]
  );

  const managementRows = useMemo(() => {
    const rows: Array<{ key: string; label: string; value: string }> = [
      {
        key: 'active_members',
        label: 'חברי צוות פעילים',
        value: String(activeRows.length),
      },
      {
        key: 'suspended_members',
        label: 'חברי צוות מושעים',
        value: String(suspendedRows.length),
      },
      {
        key: 'removed_members',
        label: 'חברי צוות שהוסרו',
        value: String(removedRows.length),
      },
      {
        key: 'pending_invites',
        label: 'הזמנות ממתינות',
        value: String(pendingInvites.length),
      },
      {
        key: 'closed_invites',
        label: 'הזמנות קודמות',
        value: String(closedInvites.length),
      },
    ];

    if (isOwner) {
      rows.push({
        key: 'active_managers',
        label: 'מנהלים פעילים',
        value: String(
          activeRows.filter((row) => row.staffRole === 'manager').length
        ),
      });
    }

    rows.push({
      key: 'seats_in_use',
      label: 'מקומות בשימוש',
      value: summary ? `${summary.usedSeats}/${summary.maxSeats}` : '--',
    });

    return rows;
  }, [
    activeRows,
    closedInvites.length,
    isOwner,
    pendingInvites.length,
    removedRows.length,
    summary,
    suspendedRows.length,
  ]);

  const activeManagersCount = useMemo(
    () => activeRows.filter((row) => row.staffRole === 'manager').length,
    [activeRows]
  );
  const seatUsageLabel = summary
    ? `${summary.usedSeats}/${summary.maxSeats}`
    : '--';
  const seatUsagePercent =
    summary && summary.maxSeats > 0
      ? Math.min(100, Math.round((summary.usedSeats / summary.maxSeats) * 100))
      : 0;
  const teamStatusChartData = useMemo(
    () => [
      { label: 'פעילים', value: activeRows.length },
      { label: 'מושעים', value: suspendedRows.length },
      { label: 'הוסרו', value: removedRows.length },
      { label: 'הזמנות', value: pendingInvites.length },
    ],
    [
      activeRows.length,
      pendingInvites.length,
      removedRows.length,
      suspendedRows.length,
    ]
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
        className={`rounded-xl border px-3 py-2 ${toneClass} ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <Text className={`text-xs font-bold ${tw.textStart}`}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderStaffCard = (
    member: StaffRow,
    section: 'active' | 'suspended' | 'removed'
  ) => {
    const isBusy = busyMemberId === member.staffId;
    const canShowActions =
      !member.isSelf &&
      canManageTeam &&
      section !== 'removed' &&
      (isOwner ? member.staffRole !== 'owner' : member.staffRole === 'staff');

    const statusToneClass =
      member.status === 'active'
        ? 'bg-emerald-100 text-emerald-700'
        : member.status === 'suspended'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-700';

    return (
      <View
        key={member.staffId}
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
      >
        <View className={`${tw.flexRow} items-start gap-3`}>
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EAF1FF]">
            <Ionicons name="person-outline" size={18} color="#1D4ED8" />
          </View>

          <View className="flex-1 items-end">
            <Text
              className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              {member.displayName}
            </Text>
            {member.phone ? (
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {member.phone}
              </Text>
            ) : null}
            {member.email ? (
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {member.email}
              </Text>
            ) : null}
            <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
              {member.staffRole === 'owner'
                ? 'בעל/ת העסק'
                : section === 'removed' && member.removedAt
                  ? `הוסר ב-${formatDate(member.removedAt)}`
                  : `הצטרף ב-${formatDate(member.joinedAt)}`}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row-reverse flex-wrap gap-2">
          <View className="rounded-full bg-[#EEF3FF] px-3 py-1">
            <Text className="text-[11px] font-bold text-[#1D4ED8]">
              {ROLE_LABEL[member.staffRole]}
            </Text>
          </View>
          <View className={`rounded-full px-3 py-1 ${statusToneClass}`}>
            <Text className="text-[11px] font-bold">
              {STATUS_LABEL[member.status]}
            </Text>
          </View>
          {member.isSelf ? (
            <View className="rounded-full bg-[#E2E8F0] px-3 py-1">
              <Text className="text-[11px] font-bold text-[#475569]">
                זה אתה
              </Text>
            </View>
          ) : null}
        </View>

        {canShowActions ? (
          <View className="mt-3 flex-row-reverse flex-wrap gap-2">
            {isOwner && member.staffRole === 'staff'
              ? renderActionButton(
                  'קדם למנהל',
                  () => {
                    void handleChangeRole(member.staffId, 'manager');
                  },
                  'neutral',
                  isBusy || Boolean(busyInviteId)
                )
              : null}

            {isOwner && member.staffRole === 'manager'
              ? renderActionButton(
                  'העבר לעובד',
                  () => {
                    void handleChangeRole(member.staffId, 'staff');
                  },
                  'neutral',
                  isBusy || Boolean(busyInviteId)
                )
              : null}

            {section === 'active'
              ? renderActionButton(
                  'השעיה',
                  () => {
                    void handleSuspend(member.staffId);
                  },
                  'danger',
                  isBusy || Boolean(busyInviteId)
                )
              : renderActionButton(
                  'הפעל מחדש',
                  () => {
                    void handleReactivate(member.staffId);
                  },
                  'success',
                  isBusy || Boolean(busyInviteId)
                )}

            {renderActionButton(
              'הסר',
              () => {
                void handleRemove(member.staffId);
              },
              'danger',
              isBusy || Boolean(busyInviteId)
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderInviteStatusLabel = (invite: TeamInviteRow) => {
    if (invite.status === 'accepted') {
      return 'התקבלה';
    }
    if (invite.status === 'cancelled') {
      return 'בוטלה';
    }
    if (invite.status === 'expired') {
      return 'פגה';
    }
    return 'ממתינה';
  };

  const renderInviteStatusTone = (invite: TeamInviteRow) => {
    if (invite.status === 'accepted') {
      return 'bg-emerald-100 text-emerald-700';
    }
    if (invite.status === 'cancelled') {
      return 'bg-rose-100 text-rose-700';
    }
    if (invite.status === 'expired') {
      return 'bg-slate-100 text-slate-700';
    }
    return 'bg-amber-100 text-amber-700';
  };

  const canCancelInviteAction = (invite: TeamInviteRow) =>
    canManageTeam &&
    invite.status === 'pending' &&
    (isOwner || invite.targetRole === 'staff');

  const getInviteResolvedAt = (invite: TeamInviteRow) => {
    if (invite.status === 'accepted') {
      return invite.acceptedAt ?? invite.resolvedAt ?? invite.createdAt;
    }
    if (invite.status === 'cancelled') {
      return invite.cancelledAt ?? invite.resolvedAt ?? invite.createdAt;
    }
    if (invite.status === 'expired') {
      return invite.resolvedAt ?? invite.expiresAt;
    }
    return invite.expiresAt;
  };

  const renderInviteCard = (
    invite: TeamInviteRow,
    mode: 'pending' | 'closed'
  ) => {
    const isBusy = busyInviteId === invite.inviteId;
    const displayName =
      invite.invitedDisplayName ??
      invite.invitedResolvedEmail ??
      invite.invitedEmail ??
      'ללא שם';
    const statusToneClass = renderInviteStatusTone(invite);
    const resolvedAt = getInviteResolvedAt(invite);

    return (
      <View
        key={invite.inviteId}
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
      >
        <View className={`${tw.flexRow} items-start gap-3`}>
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EEF3FF]">
            <Ionicons name="person-add-outline" size={18} color="#1D4ED8" />
          </View>

          <View className="flex-1 items-end">
            <Text
              className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              {displayName}
            </Text>
            {invite.invitedPhone ? (
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {invite.invitedPhone}
              </Text>
            ) : null}
            {invite.invitedResolvedEmail ? (
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {invite.invitedResolvedEmail}
              </Text>
            ) : null}
            <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
              {'נוצרה ב-'}
              {formatDate(invite.createdAt)}
              {mode === 'pending' ? ' • עד ' : ' • הוכרעה ב-'}
              {formatDate(resolvedAt)}
            </Text>
            {invite.invitedByDisplayName ? (
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {'נוצרה על ידי '}
                {invite.invitedByDisplayName}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="mt-3 flex-row-reverse flex-wrap gap-2">
          <View className="rounded-full bg-[#EEF3FF] px-3 py-1">
            <Text className="text-[11px] font-bold text-[#1D4ED8]">
              {invite.targetRole === 'manager' ? 'מנהל' : 'עובד'}
            </Text>
          </View>
          <View className={`rounded-full px-3 py-1 ${statusToneClass}`}>
            <Text className="text-[11px] font-bold">
              {renderInviteStatusLabel(invite)}
            </Text>
          </View>
        </View>

        {mode === 'pending' && canCancelInviteAction(invite)
          ? renderActionButton(
              'בטל הזמנה',
              () => {
                void handleCancelInvite(invite.inviteId);
              },
              'danger',
              isBusy
            )
          : null}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="ניהול עובדים"
            subtitle="צפייה בצוות, הרשאות והיסטוריית שינויים"
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.replace('/(authenticated)/(business)/dashboard')
                }
              />
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
          <View
            style={{
              marginTop: 16,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <View style={{ width: '48%' }}>
              <KpiCard
                label="צוות פעיל"
                value={String(activeRows.length)}
                icon="people-outline"
                tone="blue"
              />
            </View>
            <View style={{ width: '48%' }}>
              <KpiCard
                label="הזמנות ממתינות"
                value={String(pendingInvites.length)}
                icon="person-add-outline"
                tone="teal"
              />
            </View>
            <View style={{ width: '48%' }}>
              <KpiCard
                label="מנהלים פעילים"
                value={String(activeManagersCount)}
                icon="shield-checkmark-outline"
                tone="violet"
              />
            </View>
            <View style={{ width: '48%' }}>
              <KpiCard
                label="שימוש במושבים"
                value={seatUsageLabel}
                icon="grid-outline"
                tone={seatUsagePercent >= 90 ? 'amber' : 'emerald'}
                trend={{
                  direction: seatUsagePercent >= 90 ? 'down' : 'up',
                  label: `${seatUsagePercent}%`,
                }}
              />
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <BarComparisonChart
              title="סטטוס פעילות צוות"
              subtitle="התפלגות מצב כוח האדם וההזמנות בעסק"
              data={teamStatusChartData}
              color={DASHBOARD_TOKENS.colors.violet}
            />
          </View>

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              תמונת מצב
            </Text>
            <View className="mt-3">
              {managementRows.map((row, index) => (
                <View
                  key={row.key}
                  className={`${tw.flexRow} items-center justify-between py-2 ${
                    index < managementRows.length - 1
                      ? 'border-b border-[#E5EAF2]'
                      : ''
                  }`}
                >
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    {row.label}
                  </Text>
                  <Text
                    className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(authenticated)/(business)/team/add')}
            disabled={!canManageTeam}
            className={`mt-4 rounded-3xl px-4 py-4 ${
              canManageTeam ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
            }`}
          >
            <View className={`${tw.flexRow} items-center justify-center gap-2`}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text className="text-sm font-black text-white">הוספת עובד</Text>
            </View>
          </TouchableOpacity>

          {inviteError ? (
            <View className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <Text
                className={`text-xs font-semibold text-rose-700 ${tw.textStart}`}
              >
                {inviteError}
              </Text>
            </View>
          ) : null}

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <TouchableOpacity
              onPress={() => setIsActiveExpanded((current) => !current)}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                עובדים פעילים ({activeRows.length})
              </Text>
              <Ionicons
                name={isActiveExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {isActiveExpanded ? (
              <View className="mt-3 gap-3">
                {activeRows.length === 0 ? (
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין עובדים פעילים.
                  </Text>
                ) : (
                  activeRows.map((member) => renderStaffCard(member, 'active'))
                )}
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <TouchableOpacity
              onPress={() => setIsSuspendedExpanded((current) => !current)}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                עובדים מושעים ({suspendedRows.length})
              </Text>
              <Ionicons
                name={isSuspendedExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {isSuspendedExpanded ? (
              <View className="mt-3 gap-3">
                {suspendedRows.length === 0 ? (
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין עובדים מושעים.
                  </Text>
                ) : (
                  suspendedRows.map((member) =>
                    renderStaffCard(member, 'suspended')
                  )
                )}
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <TouchableOpacity
              onPress={() => setIsRemovedExpanded((current) => !current)}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                עובדים שהוסרו ({removedRows.length})
              </Text>
              <Ionicons
                name={isRemovedExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {isRemovedExpanded ? (
              <View className="mt-3 gap-3">
                {removedRows.length === 0 ? (
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין עובדים שהוסרו.
                  </Text>
                ) : (
                  removedRows.map((member) =>
                    renderStaffCard(member, 'removed')
                  )
                )}
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <TouchableOpacity
              onPress={() => setIsPendingExpanded((current) => !current)}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                הזמנות ממתינות ({pendingInvites.length})
              </Text>
              <Ionicons
                name={isPendingExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {isPendingExpanded ? (
              <View className="mt-3 gap-3">
                {pendingInvites.length === 0 ? (
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין הזמנות ממתינות.
                  </Text>
                ) : (
                  pendingInvites.map((invite) => {
                    const isBusy = busyInviteId === invite.inviteId;
                    const displayName =
                      invite.invitedDisplayName ??
                      invite.invitedResolvedEmail ??
                      invite.invitedEmail ??
                      'ללא שם';

                    return (
                      <View
                        key={invite.inviteId}
                        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
                      >
                        <View className={`${tw.flexRow} items-start gap-3`}>
                          <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EEF3FF]">
                            <Ionicons
                              name="person-add-outline"
                              size={18}
                              color="#1D4ED8"
                            />
                          </View>

                          <View className="flex-1 items-end">
                            <Text
                              className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                            >
                              {displayName}
                            </Text>
                            {invite.invitedPhone ? (
                              <Text
                                className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                              >
                                {invite.invitedPhone}
                              </Text>
                            ) : null}
                            {invite.invitedResolvedEmail ? (
                              <Text
                                className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                              >
                                {invite.invitedResolvedEmail}
                              </Text>
                            ) : null}
                            <Text
                              className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                            >
                              {'\u05e0\u05d5\u05e6\u05e8\u05d4 \u05d1-'}
                              {formatDate(invite.createdAt)}
                              {' \u2022 \u05e2\u05d3 '}
                              {formatDate(invite.expiresAt)}
                            </Text>
                          </View>
                        </View>

                        <View className="mt-3 flex-row-reverse flex-wrap gap-2">
                          <View className="rounded-full bg-[#EEF3FF] px-3 py-1">
                            <Text className="text-[11px] font-bold text-[#1D4ED8]">
                              {invite.targetRole === 'manager'
                                ? 'מנהל'
                                : 'עובד'}
                            </Text>
                          </View>
                          <View className="rounded-full bg-amber-100 px-3 py-1">
                            <Text className="text-[11px] font-bold text-amber-700">
                              ממתין לאישור
                            </Text>
                          </View>
                        </View>

                        {canCancelInviteAction(invite)
                          ? renderActionButton(
                              'בטל הזמנה',
                              () => {
                                void handleCancelInvite(invite.inviteId);
                              },
                              'danger',
                              isBusy
                            )
                          : null}
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <TouchableOpacity
              onPress={() => setIsClosedExpanded((current) => !current)}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                הזמנות קודמות ({closedInvites.length})
              </Text>
              <Ionicons
                name={isClosedExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {isClosedExpanded ? (
              <View className="mt-3 gap-3">
                {closedInvites.length === 0 ? (
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין הזמנות קודמות.
                  </Text>
                ) : (
                  closedInvites.map((invite) =>
                    renderInviteCard(invite, 'closed')
                  )
                )}
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <TouchableOpacity
              onPress={() => setIsActivityExpanded((current) => !current)}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                פעילות אחרונה בצוות ({history.length})
              </Text>
              <Ionicons
                name={isActivityExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {isActivityExpanded ? (
              <View className="mt-3 gap-3">
                {history.length === 0 ? (
                  <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                    אין עדיין אירועים בהיסטוריית הצוות.
                  </Text>
                ) : (
                  history.map((row) => (
                    <View
                      key={row.eventId}
                      className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
                    >
                      <View
                        className={`${tw.flexRow} items-start justify-between gap-2`}
                      >
                        <View className="rounded-full bg-[#EEF3FF] px-3 py-1">
                          <Text className="text-[11px] font-bold text-[#1D4ED8]">
                            {EVENT_LABEL[row.eventType]}
                          </Text>
                        </View>
                        <Text className="text-[11px] text-[#64748B]">
                          {formatDateTime(row.createdAt)}
                        </Text>
                      </View>

                      <Text
                        className={`mt-2 text-xs text-[#334155] ${tw.textStart}`}
                      >
                        {describeHistoryEvent(row)}
                      </Text>

                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        יעד:{' '}
                        {row.targetDisplayName ?? row.targetEmail ?? 'לא ידוע'}
                      </Text>

                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        בוצע על ידי: {row.actorDisplayName ?? 'מערכת'}
                      </Text>

                      {row.fromStatus && row.toStatus ? (
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          \u05e1\u05d8\u05d8\u05d5\u05e1:{' '}
                          {STATUS_LABEL[row.fromStatus]}
                          {' \u2192 '}
                          {STATUS_LABEL[row.toStatus]}
                        </Text>
                      ) : null}

                      {row.fromRole && row.toRole ? (
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          \u05ea\u05e4\u05e7\u05d9\u05d3:{' '}
                          {ROLE_LABEL[row.fromRole]}
                          {' \u2192 '}
                          {ROLE_LABEL[row.toRole]}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        </FeatureGate>
      </ScrollView>
    </SafeAreaView>
  );
}
