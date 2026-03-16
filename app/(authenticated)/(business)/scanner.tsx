import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import AnimatedActionBanner from '@/components/AnimatedActionBanner';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import QrScanner from '@/components/QrScanner';
import StickyScrollHeader from '@/components/StickyScrollHeader';
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

type ScanResultBanner = {
  customerDisplayName: string;
  statusLabel: string;
  currentStamps: number;
  maxStamps: number;
};

const BUSINESS_SUCCESS_BANNER_DURATION_MS = 5000;
const BUSINESS_SUCCESS_BANNER_MESSAGE = 'ניקוב בוצע בהצלחה';
const SCANNER_HEADER_TITLE = 'סריקת לקוח';
const SCANNER_HEADER_SUBTITLE = 'סרקו QR של הלקוח כדי להוסיף ניקוב.';

const KNOWN_SCAN_ERROR_CODES = [
  'INVALID_QR',
  'EXPIRED_TOKEN',
  'TOKEN_ALREADY_USED',
  'SELF_STAMP',
  'RATE_LIMITED',
  'CUSTOMER_NOT_FOUND',
  'MEMBERSHIP_NOT_FOUND',
  'NOT_AUTHORIZED',
  'PROGRAM_ARCHIVED',
  'NOT_ENOUGH_STAMPS',
] as const;

const resolveScanErrorCode = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'UNKNOWN';
  }
  const message = error.message ?? '';
  const matched = KNOWN_SCAN_ERROR_CODES.find((code) => message.includes(code));
  return matched ?? message;
};

const mapScanError = (error: unknown): { message: string; code: string } => {
  const code = resolveScanErrorCode(error);
  switch (code) {
    case 'INVALID_QR':
      return {
        message: '\u05e7\u05d5\u05d3 QR \u05dc\u05d0 \u05ea\u05e7\u05d9\u05df.',
        code,
      };
    case 'EXPIRED_TOKEN':
      return {
        message:
          '\u05e4\u05d2 \u05ea\u05d5\u05e7\u05e3 QR. \u05d1\u05e7\u05e9 \u05de\u05d4\u05dc\u05e7\u05d5\u05d7 \u05dc\u05e8\u05e2\u05e0\u05df \u05e7\u05d5\u05d3.',
        code,
      };
    case 'TOKEN_ALREADY_USED':
      return {
        message:
          'QR \u05db\u05d1\u05e8 \u05e0\u05e1\u05e8\u05e7. \u05d9\u05e9 \u05dc\u05d1\u05e7\u05e9 \u05de\u05d4\u05dc\u05e7\u05d5\u05d7 \u05dc\u05e8\u05e2\u05e0\u05df QR \u05d7\u05d3\u05e9.',
        code,
      };
    case 'SELF_STAMP':
      return {
        message:
          '\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e0\u05e7\u05d1 \u05dc\u05e2\u05e6\u05de\u05da.',
        code,
      };
    case 'RATE_LIMITED':
      return {
        message:
          '\u05d0\u05e4\u05e9\u05e8 \u05dc\u05d1\u05e6\u05e2 \u05e0\u05d9\u05e7\u05d5\u05d1 \u05e0\u05d5\u05e1\u05e3 \u05dc\u05d0\u05d5\u05ea\u05d5 \u05dc\u05e7\u05d5\u05d7 \u05e8\u05e7 \u05d0\u05d7\u05e8\u05d9 30 \u05e9\u05e0\u05d9\u05d5\u05ea.',
        code,
      };
    case 'CUSTOMER_NOT_FOUND':
      return {
        message:
          '\u05d4\u05dc\u05e7\u05d5\u05d7 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0.',
        code,
      };
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        message:
          '\u05db\u05e8\u05d8\u05d9\u05e1 \u05d4\u05dc\u05e7\u05d5\u05d7 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0 \u05d1\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05d4\u05d6\u05d5.',
        code,
      };
    case 'NOT_AUTHORIZED':
      return {
        message:
          '\u05d0\u05d9\u05df \u05d4\u05e8\u05e9\u05d0\u05d4 \u05dc\u05e4\u05e2\u05d5\u05dc\u05d4 \u05d4\u05d6\u05d5.',
        code,
      };
    case 'PROGRAM_ARCHIVED':
      return {
        message:
          '\u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05d1\u05d0\u05e8\u05db\u05d9\u05d5\u05df \u05d5\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e6\u05e8\u05e3 \u05d0\u05dc\u05d9\u05d4 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d7\u05d3\u05e9\u05d9\u05dd.',
        code,
      };
    case 'NOT_ENOUGH_STAMPS':
      return {
        message:
          '\u05d0\u05d9\u05df \u05de\u05e1\u05e4\u05d9\u05e7 \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd \u05db\u05d3\u05d9 \u05dc\u05de\u05de\u05e9 \u05d4\u05d8\u05d1\u05d4.',
        code,
      };
    default:
      return {
        message:
          '\u05d0\u05d9\u05e8\u05e2\u05d4 \u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05dc\u05ea\u05d9 \u05e6\u05e4\u05d5\u05d9\u05d4. \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1.',
        code,
      };
  }
};

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
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
    if (isPreviewMode) {
      return;
    }
    if (isAppModeLoading) {
      return;
    }
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
  const scannerResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

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
  const [isResolving, setIsResolving] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [resultBanner, setResultBanner] = useState<ScanResultBanner | null>(
    null
  );
  const [businessSuccessBannerKey, setBusinessSuccessBannerKey] = useState(0);

  const canScan = Boolean(selectedBusiness && selectedProgram);
  const isBusy = isResolving || isStamping;

  const openUpgrade = useCallback(
    (
      featureKey: string,
      requiredPlan: 'starter' | 'pro' | 'premium' | null,
      reason: 'feature_locked' | 'limit_reached' | 'subscription_inactive'
    ) => {
      openSubscriptionComparison(router, { featureKey, requiredPlan, reason });
    },
    [router]
  );

  const resetScanner = useCallback(() => {
    if (scannerResetTimeoutRef.current) {
      clearTimeout(scannerResetTimeoutRef.current);
      scannerResetTimeoutRef.current = null;
    }
    setScannerResetKey((current) => current + 1);
    setScanError(null);
    setResultBanner(null);
  }, []);

  const queueScannerReset = useCallback((delayMs = 1200) => {
    if (scannerResetTimeoutRef.current) {
      clearTimeout(scannerResetTimeoutRef.current);
    }
    scannerResetTimeoutRef.current = setTimeout(() => {
      setScannerResetKey((current) => current + 1);
      scannerResetTimeoutRef.current = null;
    }, delayMs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetScanner();
    }, [resetScanner])
  );

  useEffect(() => {
    return () => {
      if (scannerResetTimeoutRef.current) {
        clearTimeout(scannerResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        resetScanner();
      }
    });

    return unsubscribe;
  }, [navigation, resetScanner]);

  useEffect(() => {
    if (!resultBanner) {
      return;
    }

    const timeout = setTimeout(() => {
      setResultBanner(null);
    }, BUSINESS_SUCCESS_BANNER_DURATION_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [resultBanner]);

  const resolveByToken = useCallback(
    async (token: string, showErrors = true) => {
      const businessId = selectedBusiness?.businessId;
      const programId = selectedProgram?.loyaltyProgramId;
      if (!canScan || !businessId || !programId) {
        if (showErrors) {
          setScanError(
            '\u05d9\u05e9 \u05dc\u05d1\u05d7\u05d5\u05e8 \u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05dc\u05e4\u05e0\u05d9 \u05e1\u05e8\u05d9\u05e7\u05d4.'
          );
        }
        return null;
      }
      try {
        const result = (await resolveScan({
          qrData: token,
          businessId,
          programId,
        })) as ResolvedScan;
        setScanError(null);
        return result;
      } catch (error) {
        if (showErrors) {
          setResultBanner(null);
          const mapped = mapScanError(error);
          setScanError(
            `\u05e1\u05e8\u05d9\u05e7\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4: ${mapped.message}`
          );
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

  const stampResolvedCustomer = useCallback(
    async (resolvedScan: ResolvedScan) => {
      if (!selectedBusiness || !selectedProgram) {
        return;
      }
      const isFirstStampForCustomer = !resolvedScan.membership;
      setIsStamping(true);
      setScanError(null);
      try {
        const stampResult = await addStamp({
          businessId: selectedBusiness.businessId,
          programId: selectedProgram.loyaltyProgramId,
          customerUserId: resolvedScan.customerUserId as Id<'users'>,
        });

        setResultBanner({
          customerDisplayName: resolvedScan.customerDisplayName,
          statusLabel: stampResult.canRedeemNow
            ? '\u05d6\u05db\u05d0\u05d9 \u05dc\u05de\u05d9\u05de\u05d5\u05e9 \u05d4\u05d8\u05d1\u05d4'
            : '\u05d1\u05ea\u05d4\u05dc\u05d9\u05da \u05e6\u05d1\u05d9\u05e8\u05ea \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd',
          currentStamps: stampResult.currentStamps,
          maxStamps: stampResult.maxStamps,
        });
        Vibration.vibrate(120);
        setBusinessSuccessBannerKey((current) => current + 1);

        track(ANALYTICS_EVENTS.stampSuccess, {
          businessId: selectedBusiness.businessId,
          customerUserId: resolvedScan.customerUserId,
        });

        if (user?._id) {
          void trackActivationOnce(
            ANALYTICS_EVENTS.firstScanCompleted,
            user._id,
            { role: 'business', userId: user._id }
          );
        }
        if (isFirstStampForCustomer) {
          void trackActivationEvent(
            ANALYTICS_EVENTS.customerFirstStampReceived,
            {
              role: 'client',
              userId: resolvedScan.customerUserId,
            }
          );
        }
      } catch (error) {
        const entitlementError = getEntitlementError(error);
        if (entitlementError) {
          setScanError(
            `\u05e0\u05d9\u05e7\u05d5\u05d1 \u05e0\u05db\u05e9\u05dc: ${entitlementErrorToHebrewMessage(entitlementError)}`
          );
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
        setScanError(
          `\u05e0\u05d9\u05e7\u05d5\u05d1 \u05e0\u05db\u05e9\u05dc: ${mapped.message}`
        );
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: mapped.code,
          context: 'addStamp',
        });
      } finally {
        setIsStamping(false);
      }
    },
    [addStamp, openUpgrade, selectedBusiness, selectedProgram, user?._id]
  );

  const handleScan = useCallback(
    async (rawData: string) => {
      if (isBusy) {
        return;
      }

      const data = rawData?.trim();
      if (!data) {
        setScanError(
          '\u05e1\u05e8\u05d9\u05e7\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4: \u05e7\u05d5\u05d3 QR \u05d7\u05e1\u05e8.'
        );
        return;
      }
      if (!data.startsWith('scanToken:')) {
        setScanError(
          '\u05e1\u05e8\u05d9\u05e7\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4: \u05d6\u05d4 \u05dc\u05d0 QR \u05dc\u05e7\u05d5\u05d7 \u05ea\u05e7\u05d9\u05df.'
        );
        setResultBanner(null);
        return;
      }

      setIsResolving(true);
      setScanError(null);

      try {
        track(ANALYTICS_EVENTS.qrScannedCustomer, {
          businessId: selectedBusiness?.businessId,
        });

        const resolvedScan = await resolveByToken(data);
        if (!resolvedScan) {
          return;
        }
        await stampResolvedCustomer(resolvedScan);
      } finally {
        setIsResolving(false);
        queueScannerReset();
      }
    },
    [
      isBusy,
      queueScannerReset,
      resolveByToken,
      selectedBusiness?.businessId,
      stampResolvedCustomer,
    ]
  );

  const cycleProgram = () => {
    if (programs.length <= 1) {
      return;
    }
    setProgramIndex((prev) => (prev + 1) % programs.length);
    resetScanner();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <AnimatedActionBanner
        eventKey={businessSuccessBannerKey}
        message={BUSINESS_SUCCESS_BANNER_MESSAGE}
        topOffset={(insets.top || 0) + 8}
        durationMs={BUSINESS_SUCCESS_BANNER_DURATION_MS}
        variant="success"
      />

      <ScrollView
        style={styles.scrollBackground}
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <View style={styles.header}>
            <BusinessScreenHeader
              title={SCANNER_HEADER_TITLE}
              subtitle={SCANNER_HEADER_SUBTITLE}
            />
          </View>
        </StickyScrollHeader>

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
              {selectedProgram
                ? selectedProgram.title
                : '\u05d1\u05d7\u05e8 \u05ea\u05d5\u05db\u05e0\u05d9\u05ea'}
            </Text>
            <Text style={styles.selectorSubtitle}>
              {selectedProgram?.isArchived
                ? '\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05d1\u05d0\u05e8\u05db\u05d9\u05d5\u05df (\u05e8\u05e7 \u05dc\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05e7\u05d9\u05d9\u05de\u05d9\u05dd)'
                : programs.length > 1
                  ? '\u05dc\u05d7\u05e5 \u05db\u05d3\u05d9 \u05dc\u05d4\u05d7\u05dc\u05d9\u05e3 \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d4'
                  : '\u05d1\u05d7\u05e8 \u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05db\u05d3\u05d9 \u05dc\u05d4\u05ea\u05d7\u05d9\u05dc'}
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

        {resultBanner ? (
          <View style={styles.resultBanner}>
            <Text style={styles.resultBannerTitle}>
              {
                '\u05e4\u05e8\u05d8\u05d9 \u05d4\u05e0\u05d9\u05e7\u05d5\u05d1 \u05d4\u05d0\u05d7\u05e8\u05d5\u05df'
              }
            </Text>
            <Text style={styles.resultCustomerName}>
              {resultBanner.customerDisplayName}
            </Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>
                {'\u05de\u05e2\u05de\u05d3'}
              </Text>
              <Text style={styles.resultValue}>{resultBanner.statusLabel}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>
                {'\u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd'}
              </Text>
              <Text style={styles.resultValue}>
                {resultBanner.currentStamps}/{resultBanner.maxStamps}
              </Text>
            </View>
          </View>
        ) : null}
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
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 14,
  },
  errorText: {
    color: '#D92D20',
    fontWeight: '700',
    textAlign: 'right',
  },
  resultBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    padding: 16,
    gap: 8,
  },
  resultBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  resultCustomerName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  resultRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B6475',
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0B1220',
    textAlign: 'right',
  },
});
