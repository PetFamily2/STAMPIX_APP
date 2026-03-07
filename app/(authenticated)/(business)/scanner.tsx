import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import BrandPageHeader from '@/components/BrandPageHeader';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import QrScanner from '@/components/QrScanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { track } from '@/lib/analytics';
import {
  trackActivationEvent,
  trackActivationOnce,
} from '@/lib/analytics/activation';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type ResolvedScan = {
  customerUserId: string;
  customerDisplayName: string;
  membership: {
    membershipId: string;
    currentStamps: number;
    maxStamps: number;
    canRedeemNow: boolean;
  } | null;
};

const mapScanError = (error: unknown): { message: string; code: string } => {
  if (error instanceof Error) {
    const code = error.message;
    switch (code) {
      case 'INVALID_QR':
        return { message: 'Invalid QR code', code };
      case 'EXPIRED_TOKEN':
        return { message: 'QR expired. Ask customer to refresh.', code };
      case 'TOKEN_ALREADY_USED':
        return { message: 'QR already used. Ask customer to refresh.', code };
      case 'SELF_STAMP':
        return { message: 'Cannot stamp your own card.', code };
      case 'RATE_LIMITED':
        return { message: 'Wait 30 seconds before next stamp.', code };
      case 'CUSTOMER_NOT_FOUND':
        return { message: 'Customer not found.', code };
      case 'MEMBERSHIP_NOT_FOUND':
        return { message: 'Membership not found.', code };
      case 'NOT_AUTHORIZED':
        return { message: 'You are not authorized for this action.', code };
      case 'PROGRAM_ARCHIVED':
        return {
          message:
            'This program is archived. New customers cannot join through scanner.',
          code,
        };
      default:
        return { message: code, code };
    }
  }
  return { message: 'Something went wrong. Try again.', code: 'UNKNOWN' };
};

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { user } = useUser();
  const { activeBusinessId, activeBusiness: selectedBusiness } =
    useActiveBusiness();

  useEffect(() => {
    if (isPreviewMode) return;
    if (isAppModeLoading) return;
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programs =
    useQuery(
      api.loyaltyPrograms.listByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];
  const [programIndex, setProgramIndex] = useState(0);
  const selectedProgram = programs[programIndex];

  useEffect(() => {
    if (programs.length === 0) {
      setProgramIndex(0);
      return;
    }
    if (programIndex >= programs.length) {
      setProgramIndex(0);
    }
  }, [programIndex, programs.length]);

  const resolveScan = useMutation(api.scanner.resolveScan);
  const addStamp = useMutation(api.scanner.addStamp);
  const redeemReward = useMutation(api.scanner.redeemReward);
  const [isResolving, setIsResolving] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedScan | null>(null);

  const canScan = Boolean(selectedBusiness && selectedProgram);
  const isBusy = isResolving || isStamping || isRedeeming;

  const openUpgrade = useCallback(
    (
      featureKey: string,
      requiredPlan: 'starter' | 'pro' | 'unlimited' | null,
      reason: 'feature_locked' | 'limit_reached' | 'subscription_inactive'
    ) => {
      openSubscriptionComparison(router, { featureKey, requiredPlan, reason });
    },
    [router]
  );

  const resolveByToken = useCallback(
    async (token: string, showErrors = true) => {
      if (!canScan) {
        if (showErrors) {
          setScanError('יש לבחור תוכנית לפני סריקה.');
        }
        return null;
      }
      try {
        const result = (await resolveScan({
          qrData: token,
          businessId: selectedBusiness!.businessId,
          programId: selectedProgram!.loyaltyProgramId,
        })) as ResolvedScan;
        setResolved(result);
        setScanToken(token);
        setScanError(null);
        return result;
      } catch (error) {
        if (showErrors) {
          setResolved(null);
          const mapped = mapScanError(error);
          setScanError(mapped.message);
          track(ANALYTICS_EVENTS.stampFailed, {
            error_code: mapped.code,
            context: 'resolveScan',
          });
        }
        return null;
      }
    },
    [canScan, resolveScan, selectedBusiness, selectedProgram]
  );

  const handleScan = useCallback(
    async (rawData: string) => {
      if (isBusy) return;
      const data = rawData?.trim();
      if (!data) {
        setScanError('קוד QR חסר');
        setScannerResetKey((prev) => prev + 1);
        return;
      }
      if (!data.startsWith('scanToken:')) {
        setScanError('זה QR של לקוח בלבד');
        setResolved(null);
        setScannerResetKey((prev) => prev + 1);
        return;
      }

      setIsResolving(true);
      setStatusMessage(null);
      setScanError(null);
      track(ANALYTICS_EVENTS.qrScannedCustomer, {
        businessId: selectedBusiness?.businessId,
      });
      await resolveByToken(data);
      setIsResolving(false);
      setScannerResetKey((prev) => prev + 1);
    },
    [isBusy, resolveByToken, selectedBusiness?.businessId]
  );

  const handleAddStamp = useCallback(async () => {
    if (!resolved || !selectedBusiness || !selectedProgram) return;
    if (isBusy) return;
    const isFirstStampForCustomer = !resolved.membership;
    setIsStamping(true);
    setStatusMessage(null);
    setScanError(null);
    try {
      await addStamp({
        businessId: selectedBusiness.businessId,
        programId: selectedProgram.loyaltyProgramId,
        customerUserId: resolved.customerUserId as Id<'users'>,
      });
      setStatusMessage('ניקוב נוסף');
      track(ANALYTICS_EVENTS.stampSuccess, {
        businessId: selectedBusiness?.businessId,
        customerUserId: resolved.customerUserId,
      });
      if (user?._id) {
        void trackActivationOnce(
          ANALYTICS_EVENTS.firstScanCompleted,
          user._id,
          { role: 'business', userId: user._id }
        );
      }
      if (isFirstStampForCustomer) {
        void trackActivationEvent(ANALYTICS_EVENTS.customerFirstStampReceived, {
          role: 'client',
          userId: resolved.customerUserId,
        });
      }
      if (scanToken) {
        await resolveByToken(scanToken, false);
      }
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        setScanError(entitlementErrorToHebrewMessage(entitlementError));
        openUpgrade(
          entitlementError.featureKey ??
            entitlementError.limitKey ??
            'maxCustomers',
          entitlementError.requiredPlan ?? 'pro',
          entitlementError.code === 'PLAN_LIMIT_REACHED'
            ? 'limit_reached'
            : entitlementError.code === 'SUBSCRIPTION_INACTIVE'
              ? 'subscription_inactive'
              : 'feature_locked'
        );
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: entitlementError.code,
          context: 'addStamp',
        });
        return;
      }

      const mapped = mapScanError(error);
      setScanError(mapped.message);
      track(ANALYTICS_EVENTS.stampFailed, {
        error_code: mapped.code,
        context: 'addStamp',
      });
    } finally {
      setIsStamping(false);
    }
  }, [
    addStamp,
    isBusy,
    openUpgrade,
    resolved,
    scanToken,
    resolveByToken,
    selectedBusiness,
    selectedProgram,
    user?._id,
  ]);

  const handleRedeemReward = useCallback(async () => {
    if (!resolved || !selectedBusiness || !selectedProgram) return;
    if (isBusy) return;

    setIsRedeeming(true);
    setStatusMessage(null);
    setScanError(null);
    try {
      await redeemReward({
        businessId: selectedBusiness.businessId,
        programId: selectedProgram.loyaltyProgramId,
        customerUserId: resolved.customerUserId as Id<'users'>,
      });
      setStatusMessage(
        '\u05d4\u05d8\u05d1\u05d4 \u05de\u05d5\u05de\u05e9\u05d4 \u05d5\u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05d0\u05d5\u05e4\u05e1 \u05dc\u05de\u05d7\u05d6\u05d5\u05e8 \u05d7\u05d3\u05e9'
      );
      if (scanToken) {
        await resolveByToken(scanToken, false);
      }
    } catch (error) {
      const mapped = mapScanError(error);
      setScanError(mapped.message);
      track(ANALYTICS_EVENTS.stampFailed, {
        error_code: mapped.code,
        context: 'redeemReward',
      });
    } finally {
      setIsRedeeming(false);
    }
  }, [
    isBusy,
    redeemReward,
    resolved,
    scanToken,
    resolveByToken,
    selectedBusiness,
    selectedProgram,
  ]);

  const cycleProgram = () => {
    if (programs.length <= 1) return;
    setProgramIndex((prev) => (prev + 1) % programs.length);
  };

  const handleRetry = () => {
    setScannerResetKey((prev) => prev + 1);
    setScanError(null);
    setStatusMessage(null);
  };

  const stampState = useMemo(() => {
    const current = Number(resolved?.membership?.currentStamps ?? 0);
    const goal = Math.max(
      1,
      Number(
        resolved?.membership?.maxStamps ?? selectedProgram?.maxStamps ?? 0
      ) || 0
    );
    const dots = Math.min(goal, 20);
    const overflow = Math.max(0, goal - dots);
    return { current, goal, dots, overflow };
  }, [
    resolved?.membership?.currentStamps,
    resolved?.membership?.maxStamps,
    selectedProgram?.maxStamps,
  ]);
  const dotIds = useMemo(
    () => Array.from({ length: stampState.dots }, (_, index) => index + 1),
    [stampState.dots]
  );
  const canRedeemNow = Boolean(resolved?.membership?.canRedeemNow);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <View style={styles.header}>
          <BusinessScreenHeader
            title={'\u05e1\u05e8\u05d9\u05e7\u05ea \u05dc\u05e7\u05d5\u05d7'}
            subtitle={
              '\u05e1\u05e8\u05e7\u05d5 QR \u05e9\u05dc \u05dc\u05e7\u05d5\u05d7 \u05db\u05d3\u05d9 \u05dc\u05d4\u05d5\u05e1\u05d9\u05e3 \u05e0\u05d9\u05e7\u05d5\u05d1.'
            }
          />
          <BrandPageHeader
            style={{ display: 'none' }}
            title="סריקת לקוח"
            subtitle="סרקו QR של לקוח כדי להוסיף ניקוב."
          />
          <Text style={styles.headerTitle}>סריקת לקוח</Text>
          <Text style={styles.headerSubtitle}>
            סרוק QR של לקוח כדי להוסיף ניקוב.
          </Text>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={cycleProgram}
            style={({ pressed }) => [
              styles.selectorCard,
              { opacity: pressed ? 0.85 : 1 },
              !selectedProgram && styles.selectorCardDisabled,
            ]}
          >
            <Text style={styles.selectorTitle}>
              {selectedProgram ? selectedProgram.title : 'בחר תוכנית'}
            </Text>
            <Text style={styles.selectorSubtitle}>
              {selectedProgram?.isArchived
                ? 'Archived program (existing members only)'
                : programs.length > 1
                  ? 'Tap to switch'
                  : 'Choose a program to start'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.scannerBox}>
          <QrScanner
            onScan={handleScan}
            resetKey={scannerResetKey}
            isBusy={isBusy}
          />
        </View>

        {scanError ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        ) : null}

        {statusMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}

        <View style={[styles.card, canRedeemNow && styles.cardRedeemReady]}>
          <Text style={styles.cardTitle}>סטטוס לקוח</Text>
          {resolved ? (
            <>
              <Text style={styles.customerName}>
                {resolved.customerDisplayName}
              </Text>
              <Text style={styles.cardSubtitle}>
                {selectedProgram?.title ?? ''}
              </Text>
              <Text style={styles.progressText}>
                {stampState.current}/{stampState.goal}
              </Text>
              <View style={styles.stampRow}>
                {dotIds.map((dotId) => (
                  <View
                    key={`dot-${dotId}`}
                    style={[
                      styles.stampDot,
                      dotId <= stampState.current
                        ? { backgroundColor: '#2F6BFF', borderColor: '#2F6BFF' }
                        : styles.stampDotEmpty,
                    ]}
                  />
                ))}
                {stampState.overflow > 0 ? (
                  <Text style={styles.moreText}>+{stampState.overflow}</Text>
                ) : null}
              </View>
              {canRedeemNow ? (
                <Text style={styles.redeemReadyText}>
                  {
                    '\u05d6\u05db\u05d0\u05d9 \u05dc\u05de\u05d9\u05de\u05d5\u05e9 - \u05d4\u05de\u05ea\u05e0\u05d4 \u05ea\u05d9\u05e0\u05ea\u05df \u05d1\u05e2\u05e1\u05e7\u05d4 \u05e0\u05e4\u05e8\u05d3\u05ea'
                  }
                </Text>
              ) : (
                <Text style={styles.pendingProgressText}>
                  {
                    '\u05e6\u05d5\u05d1\u05e8 \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd \u05d1\u05ea\u05e9\u05dc\u05d5\u05dd'
                  }
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.emptyStateText}>
              סרוק QR כדי לראות פרטי לקוח.
            </Text>
          )}
        </View>

        <Pressable
          onPress={canRedeemNow ? handleRedeemReward : handleAddStamp}
          disabled={!resolved || isBusy}
          style={({ pressed }) => [
            styles.primaryButton,
            canRedeemNow && styles.primaryButtonRedeem,
            (!resolved || isBusy) && styles.primaryButtonDisabled,
            pressed && !isBusy && resolved ? { opacity: 0.9 } : null,
          ]}
        >
          {isStamping || isRedeeming ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : null}
          <Text style={styles.primaryButtonText}>
            {isRedeeming
              ? '\u05de\u05de\u05de\u05e9'
              : isStamping
                ? '\u05de\u05d5\u05e1\u05d9\u05e3'
                : canRedeemNow
                  ? '\u05de\u05de\u05e9 \u05d4\u05d8\u05d1\u05d4'
                  : '\u05d4\u05d5\u05e1\u05e3 \u05e0\u05d9\u05e7\u05d5\u05d1'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.secondaryButtonText}>סרוק מחדש</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  headerTitle: {
    display: 'none',
    fontSize: 24,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  headerSubtitle: {
    display: 'none',
    fontSize: 13,
    fontWeight: '700',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  selectorCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 12,
  },
  selectorCardDisabled: {
    backgroundColor: '#F0F4FF',
  },
  selectorTitle: {
    fontWeight: '900',
    color: '#0B1220',
    textAlign: 'center',
  },
  selectorSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#5B6475',
    textAlign: 'center',
  },
  scannerBox: {
    flex: 1,
    minHeight: 240,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardRedeemReady: {
    borderColor: '#A9E4C4',
    backgroundColor: '#F4FFF8',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  customerName: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  progressText: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '900',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  stampRow: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  stampDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  stampDotEmpty: {
    borderColor: '#E5EAF5',
    backgroundColor: '#E9EEF9',
  },
  moreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6475',
  },
  redeemReadyText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#0D7A3E',
    textAlign: 'right',
  },
  pendingProgressText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 14,
  },
  statusText: {
    color: '#1A2B4A',
    fontWeight: '700',
    textAlign: 'right',
  },
  errorText: {
    color: '#D92D20',
    fontWeight: '700',
    textAlign: 'right',
  },
  primaryButton: {
    flexDirection: 'row-reverse',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#2F6BFF',
  },
  primaryButtonRedeem: {
    backgroundColor: '#0D9A4B',
  },
  primaryButtonDisabled: {
    backgroundColor: '#8FB3FF',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#D4EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8DC5FF',
  },
  secondaryButtonText: {
    color: '#2F6BFF',
    fontWeight: '900',
  },
});
