import { useMutation } from 'convex/react';
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
import { IS_DEV_MODE } from '@/config/appConfig';
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

  const { gate } = useEntitlements(activeBusinessId);
  const teamGate = gate('team');
  const teamCopy = getLockedAreaCopy('team', teamGate.requiredPlan);

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

    setInviteError(
      '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05db\u05dc\u05dc\u05d9\u05ea.'
    );
  };

  const handleInviteByScan = async (rawData: string) => {
    if (!activeBusinessId) {
      setInviteError(
        '\u05dc\u05d0 \u05e0\u05d1\u05d7\u05e8 \u05e2\u05e1\u05e7 \u05e4\u05e2\u05d9\u05dc.'
      );
      setScannerResetKey((current) => current + 1);
      return;
    }
    if (!canManageTeam || isInvitingByScan) {
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
      setInviteSuccess(
        '\u05d4\u05d6\u05de\u05e0\u05d4 \u05e0\u05e9\u05dc\u05d7\u05d4 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4 \u05d5\u05e0\u05e8\u05e9\u05de\u05d4 \u05d1\u05d4\u05d9\u05e1\u05d8\u05d5\u05e8\u05d9\u05d9\u05ea \u05d4\u05e6\u05d5\u05d5\u05ea.'
      );
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
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="\u05d4\u05d5\u05e1\u05e4\u05ea \u05e2\u05d5\u05d1\u05d3"
            subtitle="\u05e1\u05e8\u05e7\u05d5 \u05e7\u05d5\u05d3 \u05d0\u05d9\u05e9\u05d9 \u05de\u05e1\u05d5\u05d2 QR \u05e9\u05dc \u05d4\u05e2\u05d5\u05d1\u05d3 \u05db\u05d3\u05d9 \u05dc\u05d4\u05d6\u05de\u05d9\u05df \u05d0\u05d5\u05ea\u05d5"
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.replace('/(authenticated)/(business)/team')
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
          <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-4">
            <View className="gap-2">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                1. \u05d1\u05d7\u05e8\u05d5 \u05ea\u05e4\u05e7\u05d9\u05d3
              </Text>
              <View className="flex-row-reverse gap-2">
                <TouchableOpacity
                  onPress={() => setInviteRole('staff')}
                  className={`rounded-xl border px-4 py-2 ${
                    inviteRole === 'staff'
                      ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                      : 'border-[#D6E3FF] bg-white'
                  }`}
                >
                  <Text className="text-xs font-bold text-[#1D4ED8]">
                    \u05e2\u05d5\u05d1\u05d3
                  </Text>
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
                      \u05de\u05e0\u05d4\u05dc
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View className="gap-2">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                2. \u05e1\u05e8\u05d9\u05e7\u05ea QR \u05e2\u05d5\u05d1\u05d3
              </Text>
              <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                \u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05ea\u05d6\u05d4\u05d4
                \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05d0\u05ea
                \u05e4\u05e8\u05d8\u05d9 \u05d4\u05e2\u05d5\u05d1\u05d3
                \u05de\u05d4\u05e1\u05e8\u05d9\u05e7\u05d4.
              </Text>
              <View className="mt-1 min-h-[320px] rounded-2xl border border-[#DCE7FF] bg-[#F8FAFF] p-3">
                <QrScanner
                  onScan={handleInviteByScan}
                  resetKey={scannerResetKey}
                  isBusy={isInvitingByScan}
                  caption={
                    isInvitingByScan
                      ? '\u05de\u05e2\u05d1\u05d3 \u05d4\u05d6\u05de\u05e0\u05d4...'
                      : scannedStaffDetails
                        ? '\u05d4\u05e1\u05e8\u05d9\u05e7\u05d4 \u05e0\u05e7\u05dc\u05d8\u05d4. \u05d0\u05e4\u05e9\u05e8 \u05dc\u05e1\u05e8\u05d5\u05e7 \u05e9\u05d5\u05d1.'
                        : '\u05e1\u05e8\u05e7\u05d5 \u05e7\u05d5\u05d3 QR \u05e2\u05d5\u05d1\u05d3'
                  }
                />
              </View>
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
                  \u05e4\u05e8\u05d8\u05d9 \u05e2\u05d5\u05d1\u05d3
                  \u05e9\u05d6\u05d5\u05d4\u05d4
                </Text>
                <Text
                  className={`mt-2 text-xs text-emerald-700 ${tw.textStart}`}
                >
                  \u05e9\u05dd: {scannedStaffDetails.name}
                </Text>
                <Text
                  className={`mt-1 text-xs text-emerald-700 ${tw.textStart}`}
                >
                  \u05d8\u05dc\u05e4\u05d5\u05df:{' '}
                  {scannedStaffDetails.phone ??
                    '\u05dc\u05dc\u05d0 \u05d8\u05dc\u05e4\u05d5\u05df'}
                </Text>
                <Text
                  className={`mt-1 text-xs text-emerald-700 ${tw.textStart}`}
                >
                  \u05d0\u05d9\u05de\u05d9\u05d9\u05dc:{' '}
                  {scannedStaffDetails.email ??
                    '\u05dc\u05dc\u05d0 \u05d0\u05d9\u05de\u05d9\u05d9\u05dc'}
                </Text>
                <View className="mt-2 self-start rounded-full bg-emerald-100 px-3 py-1">
                  <Text className="text-[11px] font-bold text-emerald-700">
                    \u05ea\u05e4\u05e7\u05d9\u05d3
                    \u05de\u05d5\u05d6\u05de\u05df:{' '}
                    {inviteRole === 'manager'
                      ? '\u05de\u05e0\u05d4\u05dc'
                      : '\u05e2\u05d5\u05d1\u05d3'}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View className="mt-4 gap-2">
            <TouchableOpacity
              disabled={isInvitingByScan}
              onPress={handleScanAgain}
              className={`rounded-2xl border px-4 py-3 ${
                isInvitingByScan
                  ? 'border-[#CBD5E1] bg-[#F1F5F9]'
                  : 'border-[#C7DBFF] bg-[#EEF4FF]'
              }`}
            >
              {isInvitingByScan ? (
                <ActivityIndicator color="#94A3B8" />
              ) : (
                <Text className="text-center text-sm font-bold text-[#1D4ED8]">
                  \u05e1\u05e8\u05d5\u05e7 \u05e9\u05d5\u05d1
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(authenticated)/(business)/team')}
              className="rounded-2xl border border-[#CBD5E1] bg-white px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-[#334155]">
                \u05d7\u05d6\u05e8\u05d4 \u05dc\u05e0\u05d9\u05d4\u05d5\u05dc
                \u05e6\u05d5\u05d5\u05ea
              </Text>
            </TouchableOpacity>
          </View>
        </FeatureGate>
      </ScrollView>
    </SafeAreaView>
  );
}
