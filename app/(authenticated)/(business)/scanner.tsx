import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
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

type ScannerProgram = {
  loyaltyProgramId: string;
  title: string;
  rewardName: string;
  maxStamps: number;
  stampIcon: string;
  allowPosEnroll: boolean;
};

type ScanActionMode = 'stamp' | 'redeem';

type ResolvedScan = {
  scanSessionId: string;
  sessionExpiresAt: number;
  customerUserId: string;
  customerDisplayName: string;
  membership: {
    membershipId: string;
    currentStamps: number;
    maxStamps: number;
    canRedeemNow: boolean;
  } | null;
};

type ResolvedSession = {
  scanSessionId: string;
  customerUserId: string;
  customerDisplayName: string;
  membership: ResolvedScan['membership'];
  sessionExpiresAt: number;
  actionMode: ScanActionMode;
};

type PendingRetrySession = ResolvedSession;

type CommitActionResult = {
  membershipId: string;
  currentStamps: number;
  maxStamps: number;
  canRedeemNow: boolean;
  eventId: string;
  eventType: 'STAMP_ADDED' | 'REWARD_REDEEMED';
  eventCreatedAt: number;
  undoAvailableUntil: number;
};

type UndoActionState = {
  eventId: string;
  availableUntil: number;
  customerDisplayName: string;
  actionMode: ScanActionMode;
};

type UndoActionResult = {
  status: 'reverted' | 'already_reverted';
  reversalEventId: string | null;
  membership: {
    membershipId: string;
    currentStamps: number;
    maxStamps: number;
    canRedeemNow: boolean;
    isActive?: boolean;
  } | null;
};

type ScanResultBanner = {
  customerDisplayName: string;
  statusLabel: string;
  currentStamps: number;
  maxStamps: number;
};

const BUSINESS_SUCCESS_BANNER_DURATION_MS = 15000;
const BUSINESS_SUCCESS_BANNER_MESSAGE_STAMP = 'ניקוב בוצע בהצלחה';
const BUSINESS_SUCCESS_BANNER_MESSAGE_REDEEM = 'מימוש הושלם בהצלחה';
const SCANNER_HEADER_TITLE = 'סריקת לקוח';
const SCANNER_HEADER_SUBTITLE = 'בחרו תוכנית ואז סרקו QR של הלקוח לניקוב מהיר.';
const BUSINESS_SUCCESS_BANNER_MESSAGE_UNDO = 'הפעולה בוטלה';
const SCANNER_DEVICE_ID_STORAGE_KEY = 'scanner:deviceId';
const STAFF_ROLE_BADGE_LABEL: Record<'owner' | 'manager' | 'staff', string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  staff: 'עובד',
};

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
  'PROGRAM_NOT_SCANNER_ELIGIBLE',
  'POS_ENROLL_DISABLED',
  'NOT_ENOUGH_STAMPS',
  'INVALID_SCAN_SESSION',
  'SCAN_SESSION_EXPIRED',
  'SCAN_SESSION_FAILED',
  'INVALID_SCAN_ACTION',
  'FEATURE_NOT_AVAILABLE',
  'PLAN_LIMIT_REACHED',
  'SUBSCRIPTION_INACTIVE',
] as const;

const NON_RETRYABLE_COMMIT_CODES = new Set([
  'POS_ENROLL_DISABLED',
  'PROGRAM_NOT_SCANNER_ELIGIBLE',
  'PROGRAM_ARCHIVED',
  'MEMBERSHIP_NOT_FOUND',
  'NOT_ENOUGH_STAMPS',
  'SELF_STAMP',
  'RATE_LIMITED',
  'TOKEN_ALREADY_USED',
  'EXPIRED_TOKEN',
  'INVALID_SCAN_SESSION',
  'SCAN_SESSION_EXPIRED',
  'SCAN_SESSION_FAILED',
  'INVALID_SCAN_ACTION',
  'NOT_AUTHORIZED',
  'CUSTOMER_NOT_FOUND',
  'INVALID_QR',
  'FEATURE_NOT_AVAILABLE',
  'PLAN_LIMIT_REACHED',
  'SUBSCRIPTION_INACTIVE',
]);

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
      return { message: 'קוד QR לא תקין.', code };
    case 'EXPIRED_TOKEN':
      return { message: 'פג תוקף ה-QR. בקשו מהלקוח לרענן קוד.', code };
    case 'TOKEN_ALREADY_USED':
      return { message: 'QR כבר נסרק. יש לרענן קוד חדש.', code };
    case 'SELF_STAMP':
      return { message: 'לא ניתן לנקב לעצמכם.', code };
    case 'RATE_LIMITED':
      return { message: 'אפשר לנקב שוב לאותו לקוח רק אחרי 30 שניות.', code };
    case 'CUSTOMER_NOT_FOUND':
      return { message: 'הלקוח לא נמצא.', code };
    case 'MEMBERSHIP_NOT_FOUND':
      return { message: 'ללקוח אין כרטיס פעיל בתוכנית שנבחרה.', code };
    case 'NOT_AUTHORIZED':
      return { message: 'אין הרשאה לפעולה הזו.', code };
    case 'PROGRAM_ARCHIVED':
    case 'PROGRAM_NOT_SCANNER_ELIGIBLE':
      return { message: 'התוכנית שנבחרה אינה זמינה לסריקה.', code };
    case 'POS_ENROLL_DISABLED':
      return { message: 'לא ניתן לצרף לקוח חדש לתוכנית הזו מהסורק.', code };
    case 'NOT_ENOUGH_STAMPS':
      return { message: 'אין מספיק ניקובים למימוש הטבה.', code };
    case 'INVALID_SCAN_SESSION':
    case 'SCAN_SESSION_EXPIRED':
      return { message: 'הסריקה פגה. יש לסרוק מחדש.', code };
    case 'SCAN_SESSION_FAILED':
      return { message: 'הסריקה הקודמת נדחתה. יש לסרוק מחדש.', code };
    case 'INVALID_SCAN_ACTION':
      return { message: 'פעולת הסריקה אינה תקינה.', code };
    default:
      return { message: 'אירעה שגיאה בלתי צפויה. נסו שוב.', code };
  }
};

function isTechnicalCommitError(code: string) {
  if (!code || code === 'UNKNOWN') {
    return true;
  }
  return !NON_RETRYABLE_COMMIT_CODES.has(code);
}

function generateRuntimeSessionId() {
  return `runtime_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateScannerDeviceId() {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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
  const scannerHeaderSubtitle = selectedBusiness
    ? `${selectedBusiness.name} · ${STAFF_ROLE_BADGE_LABEL[selectedBusiness.staffRole]}`
    : SCANNER_HEADER_SUBTITLE;

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
    (useQuery(
      api.loyaltyPrograms.listScannerPrograms,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) as ScannerProgram[] | undefined) ?? [];

  const scannerResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    null
  );
  const [isProgramSelectionReady, setIsProgramSelectionReady] = useState(false);
  const [selectedActionMode, setSelectedActionMode] =
    useState<ScanActionMode>('stamp');
  const selectedProgram =
    programs.find(
      (program) => program.loyaltyProgramId === selectedProgramId
    ) ?? null;
  const [scannerRuntimeSessionId, setScannerRuntimeSessionId] = useState(() =>
    generateRuntimeSessionId()
  );
  const [scannerDeviceId, setScannerDeviceId] = useState<string | null>(null);

  const resolveScan = useMutation(api.scanner.resolveScan);
  const commitStamp = useMutation(api.scanner.commitStamp);
  const commitRedeem = useMutation(api.scanner.commitRedeem);
  const undoLastScannerAction = useMutation(api.scanner.undoLastScannerAction);
  const [isResolving, setIsResolving] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [resultBanner, setResultBanner] = useState<ScanResultBanner | null>(
    null
  );
  const [retrySession, setRetrySession] = useState<PendingRetrySession | null>(
    null
  );
  const [undoState, setUndoState] = useState<UndoActionState | null>(null);
  const [businessSuccessBannerKey, setBusinessSuccessBannerKey] = useState(0);
  const [successBannerMessage, setSuccessBannerMessage] = useState(
    BUSINESS_SUCCESS_BANNER_MESSAGE_STAMP
  );

  const storageKey = activeBusinessId
    ? `scanner:lastProgram:${String(activeBusinessId)}`
    : null;

  useEffect(() => {
    let isCancelled = false;

    const hydrateDeviceId = async () => {
      try {
        const existing = await AsyncStorage.getItem(
          SCANNER_DEVICE_ID_STORAGE_KEY
        );
        if (isCancelled) {
          return;
        }
        if (existing) {
          setScannerDeviceId(existing);
          return;
        }
        const generated = generateScannerDeviceId();
        await AsyncStorage.setItem(SCANNER_DEVICE_ID_STORAGE_KEY, generated);
        if (!isCancelled) {
          setScannerDeviceId(generated);
        }
      } catch {
        if (!isCancelled) {
          setScannerDeviceId(generateScannerDeviceId());
        }
      }
    };

    void hydrateDeviceId();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const hydrateSelection = async () => {
      if (!storageKey || programs.length === 0) {
        setSelectedProgramId(programs[0]?.loyaltyProgramId ?? null);
        setIsProgramSelectionReady(true);
        return;
      }

      try {
        const storedProgramId = await AsyncStorage.getItem(storageKey);
        if (isCancelled) {
          return;
        }
        const nextProgramId = programs.some(
          (program) => program.loyaltyProgramId === storedProgramId
        )
          ? storedProgramId
          : (programs[0]?.loyaltyProgramId ?? null);
        setSelectedProgramId(nextProgramId);
      } catch {
        if (!isCancelled) {
          setSelectedProgramId(programs[0]?.loyaltyProgramId ?? null);
        }
      } finally {
        if (!isCancelled) {
          setIsProgramSelectionReady(true);
        }
      }
    };

    setIsProgramSelectionReady(false);
    void hydrateSelection();
    return () => {
      isCancelled = true;
    };
  }, [programs, storageKey]);

  const isSelectionLocked =
    isResolving || isStamping || isUndoing || retrySession !== null;
  const canScan = Boolean(
    selectedBusiness &&
      selectedProgram &&
      scannerDeviceId &&
      isProgramSelectionReady &&
      programs.length > 0
  );
  const isBusy = isResolving || isStamping || isUndoing;

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
    setRetrySession(null);
    setUndoState(null);
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
      setScannerRuntimeSessionId(generateRuntimeSessionId());
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

  useEffect(() => {
    if (!undoState) {
      return;
    }
    const remaining = undoState.availableUntil - Date.now();
    if (remaining <= 0) {
      setUndoState(null);
      return;
    }
    const timeout = setTimeout(() => {
      setUndoState(null);
    }, remaining);
    return () => {
      clearTimeout(timeout);
    };
  }, [undoState]);

  const setSelectedProgram = useCallback(
    async (programId: string) => {
      if (!storageKey) {
        setSelectedProgramId(programId);
        return;
      }
      setSelectedProgramId(programId);
      try {
        await AsyncStorage.setItem(storageKey, programId);
      } catch {
        // Selection still updates locally even if persistence fails.
      }
    },
    [storageKey]
  );

  const resolveByToken = useCallback(
    async (token: string, showErrors = true) => {
      const businessId = selectedBusiness?.businessId;
      const programId = selectedProgram?.loyaltyProgramId;
      if (!canScan || !businessId || !programId || !scannerDeviceId) {
        if (showErrors) {
          setScanError('יש לבחור תוכנית פעילה לפני סריקה.');
        }
        return null;
      }
      try {
        const result = (await resolveScan({
          qrData: token,
          businessId,
          programId: programId as Id<'loyaltyPrograms'>,
          actionType: selectedActionMode,
          scannerRuntimeSessionId,
          deviceId: scannerDeviceId as string,
        })) as ResolvedScan;
        if (!result.scanSessionId) {
          throw new Error('INVALID_SCAN_SESSION');
        }
        setScanError(null);
        return {
          scanSessionId: result.scanSessionId,
          sessionExpiresAt: result.sessionExpiresAt,
          customerUserId: result.customerUserId,
          customerDisplayName: result.customerDisplayName,
          membership: result.membership,
          actionMode: selectedActionMode,
        } satisfies ResolvedSession;
      } catch (error) {
        if (showErrors) {
          setResultBanner(null);
          const mapped = mapScanError(error);
          setScanError(`סריקה נכשלה: ${mapped.message}`);
          track(ANALYTICS_EVENTS.stampFailed, {
            error_code: mapped.code,
            context: 'resolveScan',
            action_mode: selectedActionMode,
          });
        }
        return null;
      }
    },
    [
      canScan,
      resolveScan,
      scannerDeviceId,
      scannerRuntimeSessionId,
      selectedActionMode,
      selectedBusiness,
      selectedProgram,
    ]
  );

  const commitFromSession = useCallback(
    async (session: PendingRetrySession | ResolvedSession) => {
      if (!selectedBusiness || !selectedProgram) {
        return 'business' as const;
      }
      const isFirstStampForCustomer = !session.membership;
      setIsStamping(true);
      setScanError(null);
      try {
        const result = (
          session.actionMode === 'redeem'
            ? await commitRedeem({
                scanSessionId: session.scanSessionId as Id<'scanSessions'>,
              })
            : await commitStamp({
                scanSessionId: session.scanSessionId as Id<'scanSessions'>,
              })
        ) as CommitActionResult;

        const isRedeem = session.actionMode === 'redeem';
        setRetrySession(null);
        setUndoState({
          eventId: result.eventId,
          availableUntil: result.undoAvailableUntil,
          customerDisplayName: session.customerDisplayName,
          actionMode: session.actionMode,
        });
        setSuccessBannerMessage(
          isRedeem
            ? BUSINESS_SUCCESS_BANNER_MESSAGE_REDEEM
            : BUSINESS_SUCCESS_BANNER_MESSAGE_STAMP
        );
        setResultBanner({
          customerDisplayName: session.customerDisplayName,
          statusLabel: isRedeem
            ? 'הטבה מומשה בהצלחה'
            : result.canRedeemNow
              ? 'זכאי למימוש הטבה'
              : 'בתהליך צבירת ניקובים',
          currentStamps: result.currentStamps,
          maxStamps: result.maxStamps,
        });
        Vibration.vibrate(120);
        setBusinessSuccessBannerKey((current) => current + 1);

        track(ANALYTICS_EVENTS.stampSuccess, {
          businessId: selectedBusiness.businessId,
          customerUserId: session.customerUserId,
          action_mode: session.actionMode,
        });

        if (session.actionMode === 'stamp') {
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
                userId: session.customerUserId,
              }
            );
          }
        }
        return 'success' as const;
      } catch (error) {
        const entitlementError = getEntitlementError(error);
        if (entitlementError) {
          setRetrySession(null);
          setScanError(
            `${session.actionMode === 'redeem' ? 'מימוש' : 'ניקוב'} נכשל: ${entitlementErrorToHebrewMessage(entitlementError)}`
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
            context: 'commitAction',
            action_mode: session.actionMode,
          });
          return 'business' as const;
        }

        const mapped = mapScanError(error);
        const technicalError = isTechnicalCommitError(mapped.code);
        if (technicalError) {
          setRetrySession({
            scanSessionId: session.scanSessionId,
            customerDisplayName: session.customerDisplayName,
            customerUserId: session.customerUserId,
            membership: session.membership,
            sessionExpiresAt: session.sessionExpiresAt,
            actionMode: session.actionMode,
          });
          setScanError(
            `${session.actionMode === 'redeem' ? 'מימוש' : 'ניקוב'} מושהה: ${mapped.message} ניתן לנסות שוב בלי לסרוק מחדש.`
          );
        } else {
          setRetrySession(null);
          setScanError(
            `${session.actionMode === 'redeem' ? 'מימוש' : 'ניקוב'} נכשל: ${mapped.message}`
          );
        }
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: mapped.code,
          context: 'commitAction',
          action_mode: session.actionMode,
        });
        return technicalError ? ('technical' as const) : ('business' as const);
      } finally {
        setIsStamping(false);
      }
    },
    [
      commitRedeem,
      commitStamp,
      openUpgrade,
      selectedBusiness,
      selectedProgram,
      user?._id,
    ]
  );

  const handleScan = useCallback(
    async (rawData: string) => {
      if (isBusy || isSelectionLocked) {
        return;
      }

      const data = rawData?.trim();
      if (!data) {
        setScanError('סריקה נכשלה: קוד QR חסר.');
        return;
      }
      if (!data.startsWith('scanToken:')) {
        setScanError('סריקה נכשלה: זה לא QR לקוח תקין.');
        setResultBanner(null);
        return;
      }

      setIsResolving(true);
      setScanError(null);
      setRetrySession(null);
      setUndoState(null);

      let shouldQueueReset = true;
      try {
        track(ANALYTICS_EVENTS.qrScannedCustomer, {
          businessId: selectedBusiness?.businessId,
          action_mode: selectedActionMode,
        });

        const resolvedScan = await resolveByToken(data);
        if (!resolvedScan) {
          return;
        }

        const commitState = await commitFromSession(resolvedScan);
        if (commitState === 'technical') {
          shouldQueueReset = false;
        }
      } finally {
        setIsResolving(false);
        if (shouldQueueReset) {
          queueScannerReset();
        }
      }
    },
    [
      commitFromSession,
      isBusy,
      isSelectionLocked,
      queueScannerReset,
      resolveByToken,
      selectedActionMode,
      selectedBusiness?.businessId,
    ]
  );

  const handleRetryCommit = useCallback(async () => {
    if (!retrySession || isBusy) {
      return;
    }

    if (Date.now() > retrySession.sessionExpiresAt) {
      setRetrySession(null);
      setScanError('פג תוקף הסריקה. יש לסרוק מחדש.');
      queueScannerReset();
      return;
    }

    const commitState = await commitFromSession(retrySession);
    if (commitState !== 'technical') {
      queueScannerReset();
    }
  }, [commitFromSession, isBusy, queueScannerReset, retrySession]);

  const handleUndoLastAction = useCallback(async () => {
    if (!undoState || !scannerDeviceId || isBusy) {
      return;
    }
    if (Date.now() > undoState.availableUntil) {
      setUndoState(null);
      return;
    }

    setIsUndoing(true);
    setScanError(null);
    try {
      const response = (await undoLastScannerAction({
        eventId: undoState.eventId as Id<'events'>,
        scannerRuntimeSessionId,
        deviceId: scannerDeviceId,
      })) as UndoActionResult;

      const membership = response.membership;
      if (membership) {
        setResultBanner({
          customerDisplayName: undoState.customerDisplayName,
          statusLabel: 'הפעולה בוטלה',
          currentStamps: membership.currentStamps,
          maxStamps: membership.maxStamps,
        });
      } else {
        setResultBanner(null);
      }
      setSuccessBannerMessage(BUSINESS_SUCCESS_BANNER_MESSAGE_UNDO);
      setBusinessSuccessBannerKey((current) => current + 1);
      setRetrySession(null);
      setUndoState(null);
      queueScannerReset();
    } catch {
      setScanError('לא ניתן לבטל את הפעולה כרגע.');
      setUndoState(null);
    } finally {
      setIsUndoing(false);
    }
  }, [
    isBusy,
    queueScannerReset,
    scannerDeviceId,
    scannerRuntimeSessionId,
    undoLastScannerAction,
    undoState,
  ]);

  const handleProgramPress = useCallback(
    (programId: string) => {
      if (isSelectionLocked || programId === selectedProgramId) {
        return;
      }
      void setSelectedProgram(programId);
      resetScanner();
    },
    [isSelectionLocked, resetScanner, selectedProgramId, setSelectedProgram]
  );

  const handleActionModePress = useCallback(
    (mode: ScanActionMode) => {
      if (isSelectionLocked || mode === selectedActionMode) {
        return;
      }
      setSelectedActionMode(mode);
      resetScanner();
    },
    [isSelectionLocked, resetScanner, selectedActionMode]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <AnimatedActionBanner
        eventKey={businessSuccessBannerKey}
        message={successBannerMessage}
        topOffset={(insets.top || 0) + 8}
        durationMs={BUSINESS_SUCCESS_BANNER_DURATION_MS}
        variant="success"
      />

      <ScrollView
        ref={scrollViewRef}
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
              subtitle={scannerHeaderSubtitle}
            />
          </View>
        </StickyScrollHeader>

        <View style={styles.carouselWrap}>
          <View style={styles.actionModeRow}>
            <Pressable
              onPress={() => handleActionModePress('stamp')}
              disabled={isSelectionLocked}
              style={({ pressed }) => [
                styles.actionModeButton,
                selectedActionMode === 'stamp'
                  ? styles.actionModeButtonSelected
                  : null,
                pressed ? styles.actionModeButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.actionModeLabel,
                  selectedActionMode === 'stamp'
                    ? styles.actionModeLabelSelected
                    : null,
                ]}
              >
                ניקוב
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleActionModePress('redeem')}
              disabled={isSelectionLocked}
              style={({ pressed }) => [
                styles.actionModeButton,
                selectedActionMode === 'redeem'
                  ? styles.actionModeButtonSelected
                  : null,
                pressed ? styles.actionModeButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.actionModeLabel,
                  selectedActionMode === 'redeem'
                    ? styles.actionModeLabelSelected
                    : null,
                ]}
              >
                מימוש הטבה
              </Text>
            </Pressable>
          </View>

          {programs.length === 0 ? (
            <View style={styles.emptyProgramsCard}>
              <Text style={styles.emptyProgramsTitle}>
                אין תוכנית פעילה לסריקה
              </Text>
              <Text style={styles.emptyProgramsSubtitle}>
                כדי להתחיל, הפעילו לפחות תוכנית נאמנות אחת.
              </Text>
              <Pressable
                onPress={() => router.push('/(authenticated)/(business)/cards')}
                style={({ pressed }) => [
                  styles.emptyProgramsButton,
                  pressed ? styles.emptyProgramsButtonPressed : null,
                ]}
              >
                <Text style={styles.emptyProgramsButtonText}>
                  מעבר לניהול כרטיסים
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
              >
                {programs.map((program) => {
                  const isSelected =
                    program.loyaltyProgramId ===
                    selectedProgram?.loyaltyProgramId;
                  return (
                    <Pressable
                      key={program.loyaltyProgramId}
                      onPress={() =>
                        handleProgramPress(program.loyaltyProgramId)
                      }
                      disabled={isSelectionLocked}
                      style={({ pressed }) => [
                        styles.programCard,
                        isSelected ? styles.programCardSelected : null,
                        isSelectionLocked ? styles.programCardLocked : null,
                        pressed ? styles.programCardPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.programIcon,
                          isSelected ? styles.programIconSelected : null,
                        ]}
                      >
                        {program.stampIcon}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.programTitle,
                          isSelected ? styles.programTitleSelected : null,
                        ]}
                      >
                        {program.title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.programSubtitle,
                          isSelected ? styles.programSubtitleSelected : null,
                        ]}
                      >
                        {program.maxStamps} ניקובים · {program.rewardName}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.selectionLabelCard}>
                <Text style={styles.selectionLabel}>
                  {selectedProgram
                    ? selectedActionMode === 'redeem'
                      ? `מממשים ב: ${selectedProgram.title}`
                      : `מחתימים אל: ${selectedProgram.title}`
                    : 'בחרו תוכנית לסריקה'}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.scannerBox}>
          <QrScanner
            onScan={handleScan}
            resetKey={scannerResetKey}
            isBusy={isBusy || !canScan || Boolean(retrySession)}
            caption={
              !canScan
                ? 'אין תוכנית פעילה לסריקה'
                : retrySession
                  ? 'הסריקה ממתינה לניסיון חוזר'
                  : selectedActionMode === 'redeem'
                    ? 'סרקו QR כדי לממש הטבה'
                    : undefined
            }
          />
        </View>

        {scanError ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{scanError}</Text>
            {retrySession ? (
              <Pressable
                onPress={handleRetryCommit}
                disabled={isBusy}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed ? styles.retryButtonPressed : null,
                  isBusy ? styles.retryButtonDisabled : null,
                ]}
              >
                <Text style={styles.retryButtonText}>נסה שוב</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {resultBanner ? (
          <View style={styles.resultBanner}>
            <Text style={styles.resultBannerTitle}>פרטי הפעולה האחרונה</Text>
            <Text style={styles.resultCustomerName}>
              {resultBanner.customerDisplayName}
            </Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>מעמד</Text>
              <Text style={styles.resultValue}>{resultBanner.statusLabel}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>ניקובים</Text>
              <Text style={styles.resultValue}>
                {resultBanner.currentStamps}/{resultBanner.maxStamps}
              </Text>
            </View>
            {undoState?.eventId && undoState.availableUntil > Date.now() ? (
              <Pressable
                onPress={handleUndoLastAction}
                disabled={isBusy}
                style={({ pressed }) => [
                  styles.undoButton,
                  pressed ? styles.undoButtonPressed : null,
                  isBusy ? styles.undoButtonDisabled : null,
                ]}
              >
                <Text style={styles.undoButtonText}>בטל פעולה</Text>
              </Pressable>
            ) : null}
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
  carouselWrap: {
    gap: 10,
  },
  actionModeRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  actionModeButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5E3FF',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModeButtonSelected: {
    backgroundColor: '#2F6BFF',
    borderColor: '#1F57DC',
  },
  actionModeButtonPressed: {
    opacity: 0.9,
  },
  actionModeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1A2B4A',
  },
  actionModeLabelSelected: {
    color: '#FFFFFF',
  },
  carouselContent: {
    gap: 10,
    paddingVertical: 2,
  },
  programCard: {
    minWidth: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5E3FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  programCardSelected: {
    backgroundColor: '#2F6BFF',
    borderColor: '#1F57DC',
    shadowColor: '#2F6BFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
  programCardPressed: {
    opacity: 0.9,
  },
  programCardLocked: {
    opacity: 0.8,
  },
  programIcon: {
    fontSize: 18,
    color: '#1F2A44',
    textAlign: 'right',
  },
  programIconSelected: {
    color: '#FFFFFF',
  },
  programTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0B1220',
    textAlign: 'right',
  },
  programTitleSelected: {
    color: '#FFFFFF',
  },
  programSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'right',
  },
  programSubtitleSelected: {
    color: '#DDE9FF',
  },
  selectionLabelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5E3FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionLabel: {
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: '#1A2B4A',
  },
  emptyProgramsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5E3FF',
    padding: 14,
    gap: 6,
  },
  emptyProgramsTitle: {
    color: '#1A2B4A',
    fontWeight: '900',
    textAlign: 'right',
  },
  emptyProgramsSubtitle: {
    color: '#5B6475',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'right',
  },
  emptyProgramsButton: {
    marginTop: 4,
    alignSelf: 'flex-end',
    backgroundColor: '#2F6BFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyProgramsButtonPressed: {
    opacity: 0.9,
  },
  emptyProgramsButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
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
    gap: 10,
  },
  errorText: {
    color: '#D92D20',
    fontWeight: '700',
    textAlign: 'right',
  },
  retryButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#2F6BFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryButtonPressed: {
    opacity: 0.9,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
  },
  undoButton: {
    marginTop: 4,
    alignSelf: 'flex-end',
    backgroundColor: '#EEF4FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  undoButtonPressed: {
    opacity: 0.9,
  },
  undoButtonDisabled: {
    opacity: 0.6,
  },
  undoButtonText: {
    color: '#1A2B4A',
    fontWeight: '900',
    fontSize: 12,
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
