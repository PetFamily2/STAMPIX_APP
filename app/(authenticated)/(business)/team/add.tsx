import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import QrScanner from '@/components/QrScanner';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  mapTeamInviteErrorToMessage,
  TEAM_INVITE_ERROR_MESSAGES,
} from '@/lib/domain/teamInviteErrors';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type InviteTargetRole = 'manager' | 'staff';

type ScannedStaffDetails = {
  name: string;
  phone: string | null;
  email: string | null;
};

export default function AddBusinessStaffScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
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

  const { entitlements, gate, limitStatus } = useEntitlements(activeBusinessId);
  const teamGate = gate('team');
  const teamCopy = getLockedAreaCopy('team', teamGate.requiredPlan);
  const queryArgs =
    activeBusinessId && entitlements && !teamGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip';
  const summary = useQuery(api.business.getBusinessTeamSummary, queryArgs) as
    | { usedSeats: number; maxSeats: number }
    | null
    | undefined;
  const seatLimitStatus = summary
    ? limitStatus('maxTeamSeats', summary.usedSeats)
    : null;
  const seatLimitRequiredPlan =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxTeamSeats ?? null;
  const teamSeatCopy = getLockedAreaCopy('maxTeamSeats', seatLimitRequiredPlan);
  const isTeamSeatLimitReached = seatLimitStatus?.isAtLimit === true;

  const inviteStaffByScanToken = useMutation(
    api.business.inviteBusinessStaffByScanToken
  );

  const [inviteRole, setInviteRole] = useState<InviteTargetRole>('staff');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [scannedStaffDetails, setScannedStaffDetails] =
    useState<ScannedStaffDetails | null>(null);
  const [isInvitingByScan, setIsInvitingByScan] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
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
        entitlementError.limitKey ?? entitlementError.featureKey ?? 'team',
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

  const handleInviteByScan = async (rawData: string) => {
    if (!activeBusinessId) {
      setInviteError('לא נבחר עסק פעיל.');
      setScannerResetKey((current) => current + 1);
      return;
    }
    if (!canManageTeam || isInvitingByScan) {
      return;
    }
    if (isTeamSeatLimitReached) {
      setInviteError(teamSeatCopy.lockedSubtitle);
      openUpgrade('maxTeamSeats', seatLimitRequiredPlan, 'limit_reached');
      setScannerResetKey((current) => current + 1);
      return;
    }

    const token = rawData.trim();
    if (!token) {
      setInviteError(TEAM_INVITE_ERROR_MESSAGES.INVALID_SCAN_TOKEN);
      setScannerResetKey((current) => current + 1);
      return;
    }

    setInviteError(null);
    setInviteSuccess(null);
    setScannedStaffDetails(null);
    setIsInvitingByScan(true);
    try {
      const result = await inviteStaffByScanToken({
        businessId: activeBusinessId,
        scanToken: token,
        role: isOwner ? inviteRole : 'staff',
      });

      setScannedStaffDetails(result.invitedUser);
      setInviteSuccess('הזמנה נשלחה בהצלחה ונרשמה בהיסטוריית הצוות.');
    } catch (error) {
      handleMutationError(error);
      setScannerResetKey((current) => current + 1);
    } finally {
      setIsInvitingByScan(false);
    }
  };

  const handleScanAgain = () => {
    if (isInvitingByScan) {
      return;
    }
    setInviteError(null);
    setInviteSuccess(null);
    setScannedStaffDetails(null);
    setScannerResetKey((current) => current + 1);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 30,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="הוספת עובד"
            subtitle="סרקו קוד אישי מסוג QR של העובד כדי להזמין אותו"
            titleAccessory={
              <BackButton
                onPress={() => router.replace(BUSINESS_ROUTES.team)}
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
          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-4">
            <View className="gap-2">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                1. בחרו תפקיד
              </Text>
              <View className={`${tw.flexRow} gap-2`}>
                <TouchableOpacity
                  onPress={() => setInviteRole('staff')}
                  className={`rounded-xl border px-4 py-2 ${
                    inviteRole === 'staff'
                      ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                      : 'border-[#D6E3FF] bg-white'
                  }`}
                >
                  <Text className="text-xs font-bold text-[#1D4ED8]">עובד</Text>
                </TouchableOpacity>
                {isOwner ? (
                  <TouchableOpacity
                    onPress={() => setInviteRole('manager')}
                    className={`rounded-xl border px-4 py-2 ${
                      inviteRole === 'manager'
                        ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                        : 'border-[#D6E3FF] bg-white'
                    }`}
                  >
                    <Text className="text-xs font-bold text-[#1D4ED8]">
                      מנהל
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View className="gap-2">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                2. סריקת QR עובד
              </Text>
              <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                המערכת תזהה אוטומטית את פרטי העובד מהסריקה.
              </Text>
              {isTeamSeatLimitReached ? (
                <View className="mt-1 min-h-[180px] justify-center rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <Text
                    className={`text-base font-black text-amber-800 ${tw.textStart}`}
                  >
                    {teamSeatCopy.lockedTitle}
                  </Text>
                  <Text
                    className={`mt-2 text-sm font-semibold text-amber-700 ${tw.textStart}`}
                  >
                    {teamSeatCopy.lockedSubtitle}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      openUpgrade(
                        'maxTeamSeats',
                        seatLimitRequiredPlan,
                        'limit_reached'
                      )
                    }
                    className="mt-4 rounded-2xl bg-[#1E40AF] px-4 py-3"
                  >
                    <Text className="text-center text-sm font-black text-white">
                      שדרוג לניהול צוות גדול יותר
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="mt-1 min-h-[320px] rounded-2xl border border-[#DCE7FF] bg-[#F8FAFF] p-3">
                  <QrScanner
                    onScan={handleInviteByScan}
                    resetKey={scannerResetKey}
                    isBusy={isInvitingByScan}
                    caption={
                      isInvitingByScan
                        ? 'מעבד הזמנה...'
                        : scannedStaffDetails
                          ? 'הסריקה נקלטה. אפשר לסרוק שוב.'
                          : 'סרקו קוד QR עובד'
                    }
                  />
                </View>
              )}
            </View>

            {inviteError ? (
              <Text
                className={`text-xs font-semibold text-rose-600 ${tw.textStart}`}
              >
                {inviteError}
              </Text>
            ) : null}

            {inviteSuccess ? (
              <Text
                className={`text-xs font-semibold text-emerald-700 ${tw.textStart}`}
              >
                {inviteSuccess}
              </Text>
            ) : null}

            {scannedStaffDetails ? (
              <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <Text
                  className={`text-xs font-bold text-emerald-700 ${tw.textStart}`}
                >
                  פרטי עובד שזוהה
                </Text>
                <Text
                  className={`mt-2 text-xs text-emerald-700 ${tw.textStart}`}
                >
                  שם: {scannedStaffDetails.name}
                </Text>
                <Text
                  className={`mt-1 text-xs text-emerald-700 ${tw.textStart}`}
                >
                  טלפון: {scannedStaffDetails.phone ?? 'ללא טלפון'}
                </Text>
                <Text
                  className={`mt-1 text-xs text-emerald-700 ${tw.textStart}`}
                >
                  אימייל: {scannedStaffDetails.email ?? 'ללא אימייל'}
                </Text>
                <View
                  className={`mt-2 ${tw.selfStart} rounded-full bg-emerald-100 px-3 py-1`}
                >
                  <Text className="text-[11px] font-bold text-emerald-700">
                    תפקיד מוזמן: {inviteRole === 'manager' ? 'מנהל' : 'עובד'}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View className="mt-4 gap-2">
            <TouchableOpacity
              disabled={isInvitingByScan}
              onPress={
                isTeamSeatLimitReached
                  ? () =>
                      openUpgrade(
                        'maxTeamSeats',
                        seatLimitRequiredPlan,
                        'limit_reached'
                      )
                  : handleScanAgain
              }
              className={`rounded-2xl border px-4 py-3 ${
                isInvitingByScan
                  ? 'border-[#CBD5E1] bg-[#F1F5F9]'
                  : isTeamSeatLimitReached
                    ? 'border-[#1E40AF] bg-[#EFF4FF]'
                    : 'border-[#C7DBFF] bg-[#EEF4FF]'
              }`}
            >
              {isInvitingByScan ? (
                <ActivityIndicator color="#94A3B8" />
              ) : (
                <Text className="text-center text-sm font-bold text-[#1D4ED8]">
                  {isTeamSeatLimitReached ? 'שדרוג להוספת עובד' : 'סרוק שוב'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace(BUSINESS_ROUTES.team)}
              className="rounded-2xl border border-[#CBD5E1] bg-white px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-[#334155]">
                חזרה לניהול צוות
              </Text>
            </TouchableOpacity>
          </View>
        </FeatureGate>
      </ScrollView>
    </SafeAreaView>
  );
}
