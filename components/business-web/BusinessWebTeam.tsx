import {
  useMutation,
  useQuery } from 'convex/react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  MoreHorizontal,
  ShieldCheck,
  UserPlus,
  Users,
  UserX,
  } from 'lucide-react-native';
import { useEffect,
  useMemo,
  useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';

import {
  BusinessWebConfirmDialog,
  BusinessWebDialog,
} from '@/components/business-web/BusinessWebDialog';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { mapTeamInviteErrorToMessage } from '@/lib/domain/teamInviteErrors';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { alignItems, flexDirection, ltrIslandText } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import {
  buildWebTeamLockedCopy,
  resolveWebTeamLockedRequiredPlan,
} from '@/lib/subscription/webTeamLockedState';

type StaffRole = 'owner' | 'manager' | 'staff';
type StaffStatus = 'active' | 'suspended' | 'removed';
type InviteRole = 'manager' | 'staff';

type StaffRow = {
  staffId: Id<'businessStaff'>;
  userId: Id<'users'>;
  staffRole: StaffRole;
  status: StaffStatus;
  joinedAt: number;
  displayName: string;
  phone: string | null;
  email: string | null;
  isSelf: boolean;
};

type PendingInvite = {
  inviteId: Id<'staffInvites'>;
  invitedEmail: string;
  invitedDisplayName: string | null;
  invitedResolvedEmail: string | null;
  targetRole: InviteRole;
  status: 'pending';
  expiresAt: number;
  createdAt: number;
};

type TeamSummary = {
  activeStaffCount: number;
  pendingInvitesCount: number;
  suspendedCount: number;
  managersCount: number;
  usedSeats: number;
  maxSeats: number;
};

type HistoryEventType =
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

type HistoryRow = {
  eventId: Id<'staffEvents'>;
  eventType: HistoryEventType;
  actorDisplayName: string | null;
  targetDisplayName: string | null;
  targetEmail: string | null;
  inviteTargetRole: InviteRole | null;
  fromRole: StaffRole | null;
  toRole: StaffRole | null;
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

const EVENT_LABEL: Record<HistoryEventType, string> = {
  invite_created: 'הזמנה נשלחה',
  invite_cancelled: 'הזמנה בוטלה',
  invite_accepted: 'הזמנה התקבלה',
  invite_expired: 'הזמנה פגה',
  role_changed: 'תפקיד עודכן',
  suspended: 'חברות הושעתה',
  reactivated: 'חברות חודשה',
  removed: 'עובד הוסר',
  auto_disabled_by_plan: 'הושעה עקב חבילה',
  auto_invites_cancelled_by_plan: 'הזמנות בוטלו עקב חבילה',
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

function describeHistory(row: HistoryRow) {
  if (row.eventType === 'role_changed' && row.fromRole && row.toRole) {
    return `מ-${ROLE_LABEL[row.fromRole]} ל-${ROLE_LABEL[row.toRole]}`;
  }
  if (
    (row.eventType === 'invite_created' ||
      row.eventType === 'invite_accepted') &&
    (row.toRole || row.inviteTargetRole)
  ) {
    const targetRole = row.toRole ?? row.inviteTargetRole;
    return targetRole ? `לתפקיד ${ROLE_LABEL[targetRole]}` : '';
  }
  return row.actorDisplayName ? `על ידי ${row.actorDisplayName}` : '';
}

function mapTeamActionError(error: unknown) {
  const entitlement = getEntitlementError(error);
  if (entitlement) {
    return entitlementErrorToHebrewMessage(entitlement);
  }
  const inviteMessage = mapTeamInviteErrorToMessage(error);
  if (inviteMessage) {
    return inviteMessage;
  }
  const message = error instanceof Error ? error.message : '';
  if (message.includes('CANNOT_MANAGE_SELF')) {
    return 'לא ניתן לשנות את ההרשאה של עצמך.';
  }
  if (message.includes('NOT_AUTHORIZED')) {
    return 'אין הרשאה לבצע את הפעולה הזאת.';
  }
  if (message.includes('INVITE_EXPIRED')) {
    return 'תוקף ההזמנה כבר פג.';
  }
  if (message.includes('INVITE_NOT_PENDING')) {
    return 'ההזמנה כבר אינה ממתינה.';
  }
  return 'לא הצלחנו להשלים את הפעולה. נסו שוב.';
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('') || 'צ'
  );
}

function canManageMember(actorRole: StaffRole, member: StaffRow) {
  if (member.isSelf || member.staffRole === 'owner') {
    return false;
  }
  return actorRole === 'owner' || member.staffRole === 'staff';
}

function StatusBadge({ status }: { status: StaffStatus }) {
  return (
    <View
      style={[
        styles.badge,
        status === 'active'
          ? styles.badgeSuccess
          : status === 'suspended'
            ? styles.badgeWarning
            : styles.badgeNeutral,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          status === 'active'
            ? styles.badgeTextSuccess
            : status === 'suspended'
              ? styles.badgeTextWarning
              : styles.badgeTextNeutral,
        ]}
      >
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <Icon color={TOKENS.colors.primary} size={20} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
        {detail ? <Text style={styles.summaryDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function BusinessWebTeam() {
  const { width } = useWindowDimensions();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const {
    entitlements,
    gate,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(activeBusinessId);
  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canManageTeam = capabilities?.manage_team === true;
  const actorRole = activeBusiness?.staffRole ?? 'staff';
  const teamGate = gate('team');
  const queryArgs =
    activeBusinessId && canManageTeam && entitlements && !teamGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip';
  const staff = useQuery(api.business.listBusinessStaff, queryArgs) as
    | StaffRow[]
    | undefined;
  const pending = useQuery(api.business.listPendingStaffInvites, queryArgs) as
    | PendingInvite[]
    | undefined;
  const summary = useQuery(api.business.getBusinessTeamSummary, queryArgs) as
    | TeamSummary
    | null
    | undefined;
  const history = useQuery(
    api.business.listBusinessStaffHistory,
    queryArgs === 'skip' ? 'skip' : { ...queryArgs, limit: 30 }
  ) as HistoryRow[] | undefined;

  const inviteStaff = useMutation(api.business.inviteBusinessStaff);
  const cancelInvite = useMutation(api.business.cancelStaffInvite);
  const updateRole = useMutation(api.business.updateBusinessStaffRole);
  const suspendStaff = useMutation(api.business.suspendBusinessStaff);
  const reactivateStaff = useMutation(api.business.reactivateBusinessStaff);
  const removeStaff = useMutation(api.business.removeBusinessStaff);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('staff');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    kind: 'suspend' | 'remove';
    member: StaffRow;
  } | null>(null);

  useEffect(() => {
    function closeMenus(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('keydown', closeMenus);
    return () => document.removeEventListener('keydown', closeMenus);
  }, []);

  const visibleStaff = useMemo(
    () => (staff ?? []).filter((member) => member.status !== 'removed'),
    [staff]
  );
  const maxSeats = summary?.maxSeats ?? null;
  const seatLimitReached =
    summary != null && maxSeats != null && summary.usedSeats >= maxSeats;
  const isLoading =
    queryArgs !== 'skip' &&
    (staff === undefined ||
      pending === undefined ||
      summary === undefined ||
      history === undefined);
  const teamRequiredPlan = resolveWebTeamLockedRequiredPlan({
    featureRequiredPlan:
      entitlements?.requiredPlanMap?.byFeature?.team ??
      entitlements?.requiredPlanMap?.byFeature?.canManageTeam ??
      null,
    gateRequiredPlan: teamGate.requiredPlan,
    gateReason: teamGate.reason,
  });
  const lockedCopy = buildWebTeamLockedCopy(teamRequiredPlan);
  const seatRequiredPlan =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxTeamSeats ?? null;
  const seatCopy = getLockedAreaCopy('maxTeamSeats', seatRequiredPlan);
  const showTable = width >= 1240;

  const closeInvite = () => {
    if (isInviting) {
      return;
    }
    setIsInviteOpen(false);
    setInviteEmail('');
    setInviteRole('staff');
    setInviteError('');
    setInviteSuccess('');
  };

  const submitInvite = async () => {
    if (!activeBusinessId || isInviting || seatLimitReached) {
      return;
    }
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError('יש להזין כתובת אימייל.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('כתובת האימייל אינה תקינה.');
      return;
    }
    setInviteError('');
    setInviteSuccess('');
    setIsInviting(true);
    try {
      await inviteStaff({
        businessId: activeBusinessId,
        email,
        role: actorRole === 'owner' ? inviteRole : 'staff',
      });
      setInviteSuccess('ההזמנה נשלחה ונוספה להזמנות הממתינות.');
      setInviteEmail('');
    } catch (error) {
      setInviteError(mapTeamActionError(error));
    } finally {
      setIsInviting(false);
    }
  };

  const runMemberAction = async (
    member: StaffRow,
    action: 'suspend' | 'reactivate' | 'remove' | 'manager' | 'staff'
  ) => {
    if (!activeBusinessId || busyId) {
      return;
    }
    setBusyId(String(member.staffId));
    setPageError('');
    setOpenMenuId(null);
    try {
      if (action === 'suspend') {
        await suspendStaff({
          businessId: activeBusinessId,
          staffId: member.staffId,
        });
      } else if (action === 'reactivate') {
        await reactivateStaff({
          businessId: activeBusinessId,
          staffId: member.staffId,
        });
      } else if (action === 'remove') {
        await removeStaff({
          businessId: activeBusinessId,
          staffId: member.staffId,
        });
      } else {
        await updateRole({
          businessId: activeBusinessId,
          staffId: member.staffId,
          role: action,
        });
      }
    } catch (error) {
      setPageError(mapTeamActionError(error));
    } finally {
      setBusyId(null);
      setConfirmation(null);
    }
  };

  const handleCancelInvite = async (invite: PendingInvite) => {
    if (!activeBusinessId || busyId) {
      return;
    }
    setBusyId(String(invite.inviteId));
    setPageError('');
    try {
      await cancelInvite({
        businessId: activeBusinessId,
        inviteId: invite.inviteId,
      });
    } catch (error) {
      setPageError(mapTeamActionError(error));
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (member: StaffRow) => {
    if (!canManageMember(actorRole, member)) {
      return member.staffRole === 'owner' ? (
        <View style={styles.ownerProtection}>
          <ShieldCheck color={TOKENS.colors.primary} size={16} />
          <Text style={styles.ownerProtectionText}>חשבון מוגן</Text>
        </View>
      ) : null;
    }
    const isOpen = openMenuId === String(member.staffId);
    return (
      <View style={styles.actionMenuWrap}>
        <Pressable
          accessibilityLabel={`פעולות עבור ${member.displayName}`}
          accessibilityRole="button"
          accessibilityState={{
            busy: busyId === String(member.staffId),
            expanded: isOpen,
          }}
          disabled={busyId != null}
          onPress={() => setOpenMenuId(isOpen ? null : String(member.staffId))}
          style={({ pressed }) => [
            styles.iconButton,
            pressed ? styles.pressed : null,
          ]}
        >
          {busyId === String(member.staffId) ? (
            <ActivityIndicator color={TOKENS.colors.primary} size="small" />
          ) : (
            <MoreHorizontal color={TOKENS.colors.textSecondary} size={20} />
          )}
        </Pressable>
        {isOpen ? (
          <View accessibilityRole="menu" style={styles.actionMenu}>
            {actorRole === 'owner' && member.staffRole !== 'manager' ? (
              <MenuAction
                label="הפיכה למנהל"
                onPress={() => void runMemberAction(member, 'manager')}
              />
            ) : null}
            {actorRole === 'owner' && member.staffRole === 'manager' ? (
              <MenuAction
                label="שינוי לעובד"
                onPress={() => void runMemberAction(member, 'staff')}
              />
            ) : null}
            {member.status === 'active' ? (
              <MenuAction
                label="השעיית גישה"
                onPress={() => {
                  setOpenMenuId(null);
                  setConfirmation({ kind: 'suspend', member });
                }}
              />
            ) : (
              <MenuAction
                label="הפעלת גישה מחדש"
                onPress={() => void runMemberAction(member, 'reactivate')}
              />
            )}
            <MenuAction
              danger={true}
              label="הסרה מהצוות"
              onPress={() => {
                setOpenMenuId(null);
                setConfirmation({ kind: 'remove', member });
              }}
            />
          </View>
        ) : null}
      </View>
    );
  };

  if (!activeBusinessId || !activeBusiness) {
    return (
      <PageState
        title="לא נבחר עסק פעיל"
        description="בחרו עסק כדי לנהל את הצוות שלו."
      />
    );
  }
  if (isEntitlementsLoading) {
    return <PageLoading />;
  }
  if (!canManageTeam) {
    return (
      <PageState
        title="אין הרשאה לניהול צוות"
        description="רק בעלים או מנהל עם הרשאת ניהול צוות יכולים לצפות ולבצע פעולות בעמוד הזה."
      />
    );
  }
  if (teamGate.isLocked) {
    return (
      <PageState
        title={lockedCopy.title}
        description={lockedCopy.description}
        detail={lockedCopy.detail}
      />
    );
  }
  if (isLoading) {
    return <PageLoading />;
  }

  return (
    <View style={styles.page}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCopy}>
          <Text style={styles.pageTitle}>צוות</Text>
          <Text style={styles.pageSubtitle}>
            עובדים, תפקידים והרשאות.
          </Text>
        </View>
        {!seatLimitReached ? (
          <Pressable
            accessibilityLabel="הזמנת עובד"
            accessibilityRole="button"
            onPress={() => setIsInviteOpen(true)}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <UserPlus color="#FFFFFF" size={19} />
            <Text style={styles.primaryButtonText}>הזמנת עובד</Text>
          </Pressable>
        ) : null}
      </View>

      {pageError ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
          <Text style={styles.errorText}>{pageError}</Text>
        </View>
      ) : null}

      {seatLimitReached ? (
        <View style={styles.limitBanner}>
          <View style={styles.limitCopy}>
            <Text style={styles.limitTitle}>{seatCopy.lockedTitle}</Text>
            <Text style={styles.limitText}>{seatCopy.lockedSubtitle}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.summaryGrid}>
        <SummaryCard
          icon={Users}
          label="אנשי צוות פעילים"
          value={String(summary?.activeStaffCount ?? 0)}
        />
        <SummaryCard
          icon={Clock3}
          label="הזמנות ממתינות"
          value={String(summary?.pendingInvitesCount ?? 0)}
        />
        <SummaryCard
          icon={UserX}
          label="מושעים"
          value={String(summary?.suspendedCount ?? 0)}
        />
        <SummaryCard
          detail={
            maxSeats == null
              ? undefined
              : `${summary?.usedSeats ?? 0} מתוך ${maxSeats} מקומות בשימוש`
          }
          icon={ShieldCheck}
          label="מושבי צוות"
          value={
            maxSeats == null
              ? 'ללא הגבלה'
              : `${summary?.usedSeats ?? 0}/${maxSeats}`
          }
        />
      </View>

      <Section
        count={visibleStaff.length}
        description="חברי הצוות הפעילים והמושעים, כולל הרשאה ופרטי קשר."
        title="אנשי צוות"
      >
        {(summary?.activeStaffCount ?? 0) === 0 &&
        (pending?.length ?? 0) === 0 ? (
          <View style={styles.ownerOnlyNotice}>
            <Text style={styles.ownerOnlyTitle}>הצוות עדיין כולל רק בעלים</Text>
            <Text style={styles.ownerOnlyText}>
              אפשר להזמין עובד ראשון כאשר יש מקום פנוי במסלול.
            </Text>
          </View>
        ) : null}
        {visibleStaff.length === 0 ? (
          <EmptyState text="אין עדיין אנשי צוות נוספים בעסק." />
        ) : showTable ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeading, styles.personColumn]}>
                עובד
              </Text>
              <Text style={styles.tableHeading}>תפקיד</Text>
              <Text style={styles.tableHeading}>סטטוס</Text>
              <Text style={styles.tableHeading}>הצטרפות</Text>
              <Text style={styles.tableHeading}>פעולות</Text>
            </View>
            {visibleStaff.map((member) => (
              <View key={String(member.staffId)} style={styles.tableRow}>
                <Identity member={member} style={styles.personColumn} />
                <Text style={styles.tableCell}>
                  {ROLE_LABEL[member.staffRole]}
                </Text>
                <View style={styles.tableCellWrap}>
                  <StatusBadge status={member.status} />
                </View>
                <Text style={[styles.tableCell, styles.ltrText]}>
                  {formatDate(member.joinedAt)}
                </Text>
                <View style={styles.tableCellWrap}>
                  {renderActions(member)}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.cardList}>
            {visibleStaff.map((member) => (
              <View key={String(member.staffId)} style={styles.memberCard}>
                <View style={styles.memberCardTop}>
                  <Identity member={member} />
                  {renderActions(member)}
                </View>
                <View style={styles.memberMetaRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {ROLE_LABEL[member.staffRole]}
                    </Text>
                  </View>
                  <StatusBadge status={member.status} />
                  <Text style={styles.memberDate}>
                    הצטרפות: {formatDate(member.joinedAt)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section
        count={pending?.length ?? 0}
        description="הזמנות פעילות נשמרות למשך שבעה ימים."
        title="הזמנות ממתינות"
      >
        {(pending?.length ?? 0) === 0 ? (
          <EmptyState text="אין כרגע הזמנות ממתינות." />
        ) : (
          <View style={styles.inviteList}>
            {pending?.map((invite) => {
              const canCancel =
                actorRole === 'owner' || invite.targetRole === 'staff';
              const identity =
                invite.invitedDisplayName ||
                invite.invitedResolvedEmail ||
                invite.invitedEmail;
              return (
                <View key={String(invite.inviteId)} style={styles.inviteRow}>
                  <View style={styles.inviteIcon}>
                    <CalendarClock color={TOKENS.colors.primary} size={20} />
                  </View>
                  <View style={styles.inviteCopy}>
                    <Text style={styles.inviteName}>{identity}</Text>
                    <Text style={styles.inviteMeta}>
                      {ROLE_LABEL[invite.targetRole]} · בתוקף עד{' '}
                      <Text style={styles.ltrText}>
                        {formatDate(invite.expiresAt)}
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.badge, styles.badgeWarning]}>
                    <Text style={[styles.badgeText, styles.badgeTextWarning]}>
                      ממתינה
                    </Text>
                  </View>
                  {canCancel ? (
                    <Pressable
                      accessibilityLabel={`ביטול ההזמנה של ${identity}`}
                      accessibilityRole="button"
                      accessibilityState={{
                        busy: busyId === String(invite.inviteId),
                        disabled: busyId != null,
                      }}
                      disabled={busyId != null}
                      onPress={() => void handleCancelInvite(invite)}
                      style={({ pressed }) => [
                        styles.secondarySmallButton,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      {busyId === String(invite.inviteId) ? (
                        <ActivityIndicator
                          color={TOKENS.colors.primary}
                          size="small"
                        />
                      ) : (
                        <Text style={styles.secondarySmallButtonText}>
                          ביטול
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Section>

      <View style={styles.sectionCard}>
        <Pressable
          accessibilityLabel="היסטוריית צוות"
          accessibilityRole="button"
          accessibilityState={{ expanded: isHistoryOpen }}
          onPress={() => setIsHistoryOpen((current) => !current)}
          style={({ pressed }) => [
            styles.historyHeader,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>היסטוריית צוות</Text>
            <Text style={styles.sectionDescription}>
              פעילות הרשאות והזמנות אחרונה
            </Text>
          </View>
          {isHistoryOpen ? (
            <ChevronUp color={TOKENS.colors.textMuted} size={20} />
          ) : (
            <ChevronDown color={TOKENS.colors.textMuted} size={20} />
          )}
        </Pressable>
        {isHistoryOpen ? (
          (history?.length ?? 0) === 0 ? (
            <EmptyState text="אין עדיין פעילות צוות להצגה." />
          ) : (
            <View style={styles.historyList}>
              {history?.map((event) => (
                <View key={String(event.eventId)} style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyTitle}>
                      {EVENT_LABEL[event.eventType]}
                      {event.targetDisplayName || event.targetEmail
                        ? ` · ${event.targetDisplayName ?? event.targetEmail}`
                        : ''}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {describeHistory(event)}
                      {describeHistory(event) ? ' · ' : ''}
                      {formatDateTime(event.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : null}
      </View>

      <BusinessWebDialog
        description="הזינו כתובת אימייל ובחרו את התפקיד המתאים."
        dismissDisabled={isInviting}
        onDismiss={closeInvite}
        title="הזמנת עובד"
        visible={isInviteOpen}
      >
        <View style={styles.modalForm}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>אימייל</Text>
            <TextInput
              accessibilityLabel="כתובת אימייל לעובד"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!isInviting && !inviteSuccess}
              keyboardType="email-address"
              onChangeText={(value) => {
                setInviteEmail(value);
                setInviteError('');
              }}
              onSubmitEditing={() => void submitInvite()}
              placeholder="name@example.com"
              placeholderTextColor={TOKENS.colors.textMuted}
              style={[styles.input, styles.ltrInput]}
              value={inviteEmail}
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>תפקיד</Text>
            <View style={styles.roleOptions}>
              <RoleOption
                disabled={isInviting || Boolean(inviteSuccess)}
                label="עובד"
                onPress={() => setInviteRole('staff')}
                selected={inviteRole === 'staff'}
              />
              {actorRole === 'owner' ? (
                <RoleOption
                  disabled={isInviting || Boolean(inviteSuccess)}
                  label="מנהל"
                  onPress={() => setInviteRole('manager')}
                  selected={inviteRole === 'manager'}
                />
              ) : null}
            </View>
          </View>
          {inviteError ? (
            <Text accessibilityLiveRegion="polite" style={styles.formError}>
              {inviteError}
            </Text>
          ) : null}
          {inviteSuccess ? (
            <View accessibilityLiveRegion="polite" style={styles.successBox}>
              <Check color={TOKENS.colors.success} size={20} />
              <Text style={styles.successText}>{inviteSuccess}</Text>
            </View>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isInviting}
              onPress={closeInvite}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {inviteSuccess ? 'סיום' : 'ביטול'}
              </Text>
            </Pressable>
            {!inviteSuccess ? (
              <Pressable
                accessibilityLabel="שליחת הזמנה"
                accessibilityRole="button"
                accessibilityState={{ busy: isInviting, disabled: isInviting }}
                disabled={isInviting}
                onPress={() => void submitInvite()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                {isInviting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <UserPlus color="#FFFFFF" size={18} />
                )}
                <Text style={styles.primaryButtonText}>שליחת הזמנה</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </BusinessWebDialog>

      <BusinessWebConfirmDialog
        busy={
          confirmation != null && busyId === String(confirmation.member.staffId)
        }
        confirmLabel={confirmation?.kind === 'remove' ? 'הסרה' : 'השעיה'}
        description={
          confirmation?.kind === 'remove'
            ? `הגישה של ${confirmation.member.displayName} לעסק תבוטל. כדי להחזיר אותה יהיה צורך בהזמנה חדשה.`
            : `הגישה של ${confirmation?.member.displayName ?? ''} לעסק תושהה עד להפעלה מחדש.`
        }
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) {
            void runMemberAction(
              confirmation.member,
              confirmation.kind === 'remove' ? 'remove' : 'suspend'
            );
          }
        }}
        title={
          confirmation?.kind === 'remove' ? 'הסרת חבר צוות' : 'השעיית גישה'
        }
        visible={confirmation != null}
      />
    </View>
  );
}

function MenuAction({
  danger = false,
  label,
  onPress,
}: {
  danger?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuAction,
        pressed ? styles.menuActionPressed : null,
      ]}
    >
      <Text style={[styles.menuActionText, danger ? styles.dangerText : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Identity({ member, style }: { member: StaffRow; style?: object }) {
  return (
    <View style={[styles.identity, style]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(member.displayName)}</Text>
      </View>
      <View style={styles.identityCopy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.identityName}>
            {member.displayName}
          </Text>
          {member.isSelf ? <Text style={styles.selfLabel}>את/ה</Text> : null}
        </View>
        {member.email || member.phone ? (
          <Text numberOfLines={1} style={styles.identityMeta}>
            {member.email ?? member.phone}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RoleOption({
  disabled,
  label,
  onPress,
  selected,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleOption,
        selected ? styles.roleOptionSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.radio, selected ? styles.radioSelected : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <Text
        style={[
          styles.roleOptionText,
          selected ? styles.roleOptionTextSelected : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  children,
  count,
  description,
  title,
}: {
  children: React.ReactNode;
  count: number;
  description: string;
  title: string;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingCopy}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{count}</Text>
            </View>
          </View>
          <Text style={styles.sectionDescription}>{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Users color={TOKENS.colors.textMuted} size={24} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function PageLoading() {
  return (
    <View style={styles.pageState}>
      <ActivityIndicator color={TOKENS.colors.primary} size="large" />
      <Text style={styles.pageStateDescription}>טוענים את נתוני הצוות…</Text>
    </View>
  );
}

function PageState({
  description,
  detail,
  title,
}: {
  description: string;
  detail?: string;
  title: string;
}) {
  return (
    <View style={styles.pageState}>
      <View style={styles.pageStateIcon}>
        <ShieldCheck color={TOKENS.colors.primary} size={26} />
      </View>
      <Text style={styles.pageStateTitle}>{title}</Text>
      <Text style={styles.pageStateDescription}>{description}</Text>
      {detail ? <Text style={styles.pageStateDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignSelf: 'center',
    gap: TOKENS.space.xl,
    maxWidth: 980,
    width: '100%',
  },
  pageHeader: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    justifyContent: 'space-between',
  },
  pageHeaderCopy: { flex: 1, gap: TOKENS.space.xs },
  pageTitle: {
    ...TOKENS.typography.pageTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pageSubtitle: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: TOKENS.space.lg,
  },
  primaryButtonText: { ...TOKENS.typography.label, color: '#FFFFFF' },
  pressed: { opacity: 0.82 },
  errorBanner: {
    backgroundColor: TOKENS.colors.dangerSubtle,
    borderColor: '#FECACA',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    padding: TOKENS.space.md,
  },
  errorText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  limitBanner: {
    backgroundColor: TOKENS.colors.warningSubtle,
    borderColor: '#FED7AA',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    padding: TOKENS.space.md,
  },
  limitCopy: { gap: TOKENS.space.xs },
  limitTitle: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.warning,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  limitText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.warning,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryGrid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 10,
  },
  summaryCard: {
    alignItems: alignItems.start,
    flex: 1,
    flexBasis: 150,
    flexDirection: flexDirection.row,
    gap: 0,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  summaryIcon: {
    display: 'none',
  },
  summaryCopy: { flex: 1, gap: 2 },
  summaryLabel: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryValue: {
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 25,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
  },
  summaryDetail: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionCard: {
    backgroundColor: 'transparent',
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    overflow: 'visible',
    paddingTop: 12,
  },
  sectionHeader: { marginBottom: 10 },
  sectionHeadingCopy: { flex: 1, gap: 2 },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
  },
  sectionTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionDescription: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 28,
    paddingHorizontal: TOKENS.space.sm,
  },
  countBadgeText: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.primary,
  },
  table: {
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
  },
  tableHeader: {
    backgroundColor: TOKENS.colors.subtleSurface,
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    minHeight: 34,
    paddingHorizontal: TOKENS.space.lg,
  },
  tableHeading: {
    ...TOKENS.typography.metadata,
    alignSelf: 'center',
    color: TOKENS.colors.textMuted,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  personColumn: { flex: 2 },
  tableRow: {
    alignItems: 'center',
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    minHeight: 50,
    paddingHorizontal: TOKENS.space.lg,
  },
  tableCell: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tableCellWrap: { alignItems: alignItems.start, flex: 1 },
  identity: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    minWidth: 0,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  avatarText: { ...TOKENS.typography.label, color: TOKENS.colors.primary },
  identityCopy: { flex: 1, gap: 2, minWidth: 0 },
  nameRow: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
  },
  identityName: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  identityMeta: {
    ...TOKENS.typography.metadata,
    ...ltrIslandText,
    color: TOKENS.colors.textMuted,
  },
  selfLabel: { ...TOKENS.typography.metadata, color: TOKENS.colors.primary },
  badge: {
    alignItems: 'center',
    borderRadius: TOKENS.radii.pill,
    justifyContent: 'center',
    minHeight: 22,
    paddingHorizontal: 8,
  },
  badgeSuccess: { backgroundColor: TOKENS.colors.successSubtle },
  badgeWarning: { backgroundColor: TOKENS.colors.warningSubtle },
  badgeNeutral: { backgroundColor: TOKENS.colors.subtleSurface },
  badgeText: { ...TOKENS.typography.metadata },
  badgeTextSuccess: { color: TOKENS.colors.success },
  badgeTextWarning: { color: TOKENS.colors.warning },
  badgeTextNeutral: { color: TOKENS.colors.textMuted },
  roleBadge: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    minHeight: 22,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  roleBadgeText: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.primary,
  },
  ownerProtection: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.xs,
  },
  ownerProtectionText: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.primary,
  },
  actionMenuWrap: { position: 'relative', zIndex: 20 },
  iconButton: {
    alignItems: 'center',
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  actionMenu: {
    ...TOKENS.shadow,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    minWidth: 180,
    overflow: 'hidden',
    position: 'absolute',
    start: 0,
    top: 44,
    zIndex: 100,
  },
  menuAction: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: TOKENS.space.lg,
  },
  menuActionPressed: { backgroundColor: TOKENS.colors.subtleSurface },
  menuActionText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dangerText: { color: TOKENS.colors.danger },
  cardList: { gap: TOKENS.space.md },
  memberCard: {
    backgroundColor: TOKENS.colors.subtleSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  memberCardTop: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    justifyContent: 'space-between',
  },
  memberMetaRow: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.sm,
  },
  memberDate: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    marginStart: 'auto',
    writingDirection: 'rtl',
  },
  inviteList: { gap: TOKENS.space.sm },
  inviteRow: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.subtleSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 10,
    padding: TOKENS.space.md,
  },
  inviteIcon: {
    display: 'none',
  },
  inviteCopy: { flex: 1, gap: 2, minWidth: 180 },
  inviteName: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inviteMeta: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  secondarySmallButton: {
    alignItems: 'center',
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: 8,
  },
  secondarySmallButtonText: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textSecondary,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
  },
  historyList: {
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    gap: 14,
    marginTop: TOKENS.space.lg,
    paddingTop: TOKENS.space.lg,
  },
  historyRow: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
  },
  historyDot: {
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.pill,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  historyCopy: { flex: 1, gap: 2 },
  historyTitle: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  historyMeta: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyState: {
    alignItems: 'center',
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    minHeight: 88,
    padding: TOKENS.space.md,
  },
  ownerOnlyNotice: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.md,
    gap: TOKENS.space.xs,
    marginBottom: TOKENS.space.lg,
    padding: TOKENS.space.md,
  },
  ownerOnlyTitle: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ownerOnlyText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pageState: {
    ...TOKENS.shadow,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    gap: TOKENS.space.md,
    justifyContent: 'center',
    maxWidth: 620,
    minHeight: 160,
    padding: TOKENS.space.xxl,
    width: '100%',
  },
  pageStateIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  pageStateTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pageStateDescription: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pageStateDetail: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  modalForm: { gap: TOKENS.space.lg },
  formField: { gap: TOKENS.space.sm },
  formLabel: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    color: TOKENS.colors.textPrimary,
    fontSize: 13,
    minHeight: 38,
    paddingHorizontal: TOKENS.space.lg,
    paddingVertical: TOKENS.space.md,
  },
  ltrInput: { ...ltrIslandText },
  roleOptions: { flexDirection: flexDirection.row, gap: TOKENS.space.md },
  roleOption: {
    alignItems: 'center',
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    minHeight: 38,
    paddingHorizontal: TOKENS.space.lg,
  },
  roleOptionSelected: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderColor: TOKENS.colors.primary,
  },
  roleOptionText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textSecondary,
  },
  roleOptionTextSelected: { color: TOKENS.colors.primary },
  radio: {
    alignItems: 'center',
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.pill,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  radioSelected: { borderColor: TOKENS.colors.primary },
  radioDot: {
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.pill,
    height: 10,
    width: 10,
  },
  formError: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  successBox: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.successSubtle,
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    padding: TOKENS.space.md,
  },
  successText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.success,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalActions: { flexDirection: flexDirection.row, gap: TOKENS.space.md },
  secondaryButton: {
    alignItems: 'center',
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: TOKENS.space.lg,
  },
  secondaryButtonText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textSecondary,
  },
  ltrText: { ...ltrIslandText },
});
