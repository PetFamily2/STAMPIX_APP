import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  type ParamListBase,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import AnimatedActionBanner from '@/components/AnimatedActionBanner';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
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
  imageUrl?: string | null;
  rewardName: string;
  maxStamps: number;
  stampIcon: string;
  stampShape?: 'circle' | 'roundedSquare' | 'square' | 'hexagon' | 'icon';
  cardThemeId?: string | null;
  allowPosEnroll: boolean;
};

type CommitActionMode = 'stamp' | 'redeem';

type ResolveDecision = 'AUTO_STAMP' | 'REDEEM_AVAILABLE' | 'JOIN_AND_STAMP';

type ResolvedScan = {
  scanSessionId: string;
  sessionExpiresAt: number;
  customerUserId: string;
  customerDisplayName: string;
  resolution: ResolveDecision;
  membership: {
    membershipId: string;
    currentStamps: number;
    maxStamps: number;
    canRedeemNow: boolean;
  } | null;
};

type PendingRedeemSession = {
  scanSessionId: string;
  customerUserId: string;
  customerDisplayName: string;
  membership: ResolvedScan['membership'];
  sessionExpiresAt: number;
};

type PendingRetrySession = PendingRedeemSession & {
  actionMode: CommitActionMode;
  isFirstStampForCustomer: boolean;
};

type CommitActionResult = {
  membershipId: string;
  currentStamps: number;
  maxStamps: number;
  canRedeemNow: boolean;
  eventId: string;
  eventType: 'STAMP_ADDED' | 'REWARD_REDEEMED';
  eventCreatedAt: number;
  undoAvailableUntil?: number;
};

type UndoActionState = {
  eventId: string;
  availableUntil: number;
  customerDisplayName: string;
  actionMode: CommitActionMode;
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

const BUSINESS_SUCCESS_BANNER_DURATION_MS = 30000;
const BUSINESS_SUCCESS_BANNER_MESSAGE_STAMP = 'ניקוב בוצע בהצלחה';
const BUSINESS_SUCCESS_BANNER_MESSAGE_REDEEM = 'מימוש הושלם בהצלחה';
const SCANNER_HEADER_TITLE = 'סריקת לקוח';
const SCANNER_DEVICE_ID_STORAGE_KEY = 'scanner:deviceId';
const FALLBACK_UNDO_WINDOW_MS = 30_000;
const PROGRAM_DOT_SLOT_WIDTH = 20;
const PROGRAM_DOT_SLOT_HEIGHT = 12;
const PROGRAM_DOT_SIZE = 6;
const PROGRAM_DOT_ACTIVE_WIDTH = 18;
const CARD_GAP = 12;
const CARD_SIDE_PEEK_MIN = 44;
const CARD_SIDE_PEEK_MAX = 56;

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

const getUndoPresentation = (actionMode: CommitActionMode) =>
  actionMode === 'redeem'
    ? {
        badgeLabel: 'מימוש אחרון',
        title: 'אפשר לבטל עכשיו את המימוש האחרון',
        description: 'הביטול ישחזר את מצב הכרטיס כפי שהיה לפני המימוש.',
        confirmationText:
          'אישור הביטול יחזיר את ההטבה לזמינות, בהתאם למצב הניקובים המעודכן.',
        buttonLabel: 'בטל מימוש אחרון',
        busyLabel: 'מבטלים מימוש...',
        successMessage: 'המימוש בוטל',
        resultStatusLabel: 'המימוש בוטל',
        alreadyRevertedLabel: 'המימוש כבר בוטל',
        errorLabel: 'לא ניתן לבטל את המימוש כרגע.',
      }
    : {
        badgeLabel: 'ניקוב אחרון',
        title: 'אפשר לבטל עכשיו את הניקוב האחרון',
        description: 'הביטול ישחזר את מצב הכרטיס כפי שהיה לפני הניקוב.',
        confirmationText:
          'אישור הביטול יחזיר את מספר הניקובים למצב הקודם של הלקוח.',
        buttonLabel: 'בטל ניקוב אחרון',
        busyLabel: 'מבטלים ניקוב...',
        successMessage: 'הניקוב בוטל',
        resultStatusLabel: 'הניקוב בוטל',
        alreadyRevertedLabel: 'הניקוב כבר בוטל',
        errorLabel: 'לא ניתן לבטל את הניקוב כרגע.',
      };

const formatUndoCountdownLabel = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

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
  const programCarouselRef = useRef<FlatList<ScannerProgram> | null>(null);
  const shouldAutoAlignProgramCarouselRef = useRef(true);
  const lastProgramCarouselLayoutKeyRef = useRef('');
  const { width: windowWidth } = useWindowDimensions();
  const [programSliderMeasuredWidth, setProgramSliderMeasuredWidth] =
    useState(0);
  const programSliderViewportWidth = useMemo(() => {
    if (programSliderMeasuredWidth > 0) {
      return programSliderMeasuredWidth;
    }
    return Math.max(240, windowWidth);
  }, [programSliderMeasuredWidth, windowWidth]);
  const CARD_SIDE_PEEK = useMemo(
    () =>
      Math.min(
        CARD_SIDE_PEEK_MAX,
        Math.max(
          CARD_SIDE_PEEK_MIN,
          Math.round(programSliderViewportWidth * 0.13)
        )
      ),
    [programSliderViewportWidth]
  );
  const CARD_WIDTH = useMemo(
    () => Math.max(240, programSliderViewportWidth - CARD_SIDE_PEEK * 2),
    [CARD_SIDE_PEEK, programSliderViewportWidth]
  );
  const ITEM_STRIDE = useMemo(() => CARD_WIDTH + CARD_GAP, [CARD_WIDTH]);
  const SIDE_PADDING = useMemo(
    () => Math.max(0, (programSliderViewportWidth - CARD_WIDTH) / 2),
    [CARD_WIDTH, programSliderViewportWidth]
  );

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    null
  );
  const [isProgramSelectionReady, setIsProgramSelectionReady] = useState(false);
  const selectedProgram =
    programs.find(
      (program) => program.loyaltyProgramId === selectedProgramId
    ) ?? null;
  const selectedProgramIndex = useMemo(
    () =>
      programs.findIndex(
        (program) => program.loyaltyProgramId === selectedProgramId
      ),
    [programs, selectedProgramId]
  );
  const [visibleProgramIndex, setVisibleProgramIndex] = useState(0);
  const activeProgramDotIndex =
    programs.length > 0
      ? Math.min(programs.length - 1, Math.max(0, visibleProgramIndex))
      : 0;
  const dotsTrackWidth =
    programs.length > 0 ? programs.length * PROGRAM_DOT_SLOT_WIDTH : 0;
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
  const [pendingRedeemSession, setPendingRedeemSession] =
    useState<PendingRedeemSession | null>(null);
  const [retrySession, setRetrySession] = useState<PendingRetrySession | null>(
    null
  );
  const [undoState, setUndoState] = useState<UndoActionState | null>(null);
  const [undoNow, setUndoNow] = useState(() => Date.now());
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

  useEffect(() => {
    const layoutKey = [
      isProgramSelectionReady ? 'ready' : 'loading',
      programs.length,
      CARD_WIDTH,
      ITEM_STRIDE,
      SIDE_PADDING,
    ].join(':');
    if (lastProgramCarouselLayoutKeyRef.current !== layoutKey) {
      lastProgramCarouselLayoutKeyRef.current = layoutKey;
      shouldAutoAlignProgramCarouselRef.current = true;
    }
    if (programs.length === 0) {
      return;
    }
    if (ITEM_STRIDE <= 0) {
      return;
    }
    if (!isProgramSelectionReady || selectedProgramIndex < 0) {
      return;
    }
    if (!shouldAutoAlignProgramCarouselRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      programCarouselRef.current?.scrollToOffset({
        offset: selectedProgramIndex * ITEM_STRIDE,
        animated: false,
      });
      shouldAutoAlignProgramCarouselRef.current = false;
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    isProgramSelectionReady,
    programs.length,
    CARD_WIDTH,
    ITEM_STRIDE,
    SIDE_PADDING,
    selectedProgramIndex,
  ]);

  useEffect(() => {
    if (selectedProgramIndex >= 0) {
      setVisibleProgramIndex(selectedProgramIndex);
    }
  }, [selectedProgramIndex]);

  const isSelectionLocked =
    isResolving ||
    isStamping ||
    isUndoing ||
    retrySession !== null ||
    pendingRedeemSession !== null;
  const canScan = Boolean(
    selectedBusiness &&
      selectedProgram &&
      scannerDeviceId &&
      isProgramSelectionReady &&
      programs.length > 0
  );
  const isBusy = isResolving || isStamping || isUndoing;
  const undoTimeRemainingMs = undoState
    ? Math.max(0, undoState.availableUntil - undoNow)
    : 0;
  const undoActionActive = Boolean(undoState && undoTimeRemainingMs > 0);
  const undoPresentation = useMemo(() => {
    if (!undoState) {
      return null;
    }

    return {
      ...getUndoPresentation(undoState.actionMode),
      countdownLabel: formatUndoCountdownLabel(undoTimeRemainingMs),
    };
  }, [undoState, undoTimeRemainingMs]);

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
    setPendingRedeemSession(null);
    setRetrySession(null);
    setUndoState(null);
  }, []);

  const queueScannerReset = useCallback((delayMs = 30000) => {
    if (scannerResetTimeoutRef.current) {
      clearTimeout(scannerResetTimeoutRef.current);
    }
    scannerResetTimeoutRef.current = setTimeout(() => {
      setScannerResetKey((current) => current + 1);
      scannerResetTimeoutRef.current = null;
    }, delayMs);
  }, []);

  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();

  useFocusEffect(
    useCallback(() => {
      setScannerRuntimeSessionId(generateRuntimeSessionId());
      resetScanner();
    }, [resetScanner])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      resetScanner();
    });
    return unsubscribe;
  }, [navigation, resetScanner]);

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

  useEffect(() => {
    if (!undoState) {
      return;
    }

    setUndoNow(Date.now());
    const interval = setInterval(() => {
      setUndoNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
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

  const applyCommitOutcome = useCallback(
    (params: {
      session: PendingRedeemSession;
      result: CommitActionResult;
      actionMode: CommitActionMode;
      isFirstStampForCustomer: boolean;
    }) => {
      const isRedeem = params.actionMode === 'redeem';
      const now = Date.now();
      const undoAvailableUntil =
        typeof params.result.undoAvailableUntil === 'number' &&
        Number.isFinite(params.result.undoAvailableUntil) &&
        params.result.undoAvailableUntil > now
          ? params.result.undoAvailableUntil
          : now + FALLBACK_UNDO_WINDOW_MS;
      setPendingRedeemSession(null);
      setRetrySession(null);
      setUndoNow(now);
      setUndoState({
        eventId: params.result.eventId,
        availableUntil: undoAvailableUntil,
        customerDisplayName: params.session.customerDisplayName,
        actionMode: params.actionMode,
      });
      setSuccessBannerMessage(
        isRedeem
          ? BUSINESS_SUCCESS_BANNER_MESSAGE_REDEEM
          : BUSINESS_SUCCESS_BANNER_MESSAGE_STAMP
      );
      setResultBanner({
        customerDisplayName: params.session.customerDisplayName,
        statusLabel: isRedeem
          ? 'הטבה מומשה בהצלחה'
          : params.result.canRedeemNow
            ? 'זכאי למימוש הטבה'
            : 'בתהליך צבירת ניקובים',
        currentStamps: params.result.currentStamps,
        maxStamps: params.result.maxStamps,
      });
      Vibration.vibrate(120);
      setBusinessSuccessBannerKey((current) => current + 1);

      track(ANALYTICS_EVENTS.stampSuccess, {
        businessId: selectedBusiness?.businessId ?? null,
        customerUserId: params.session.customerUserId,
        action_mode: params.actionMode,
      });

      if (params.actionMode === 'stamp') {
        if (user?._id) {
          void trackActivationOnce(
            ANALYTICS_EVENTS.firstScanCompleted,
            user._id,
            {
              role: 'business',
              userId: user._id,
            }
          );
        }
        if (params.isFirstStampForCustomer) {
          void trackActivationEvent(
            ANALYTICS_EVENTS.customerFirstStampReceived,
            {
              role: 'client',
              userId: params.session.customerUserId,
            }
          );
        }
      }
    },
    [selectedBusiness?.businessId, user?._id]
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
          scannerRuntimeSessionId,
          deviceId: scannerDeviceId as string,
        })) as ResolvedScan;
        if (!result.scanSessionId) {
          throw new Error('INVALID_SCAN_SESSION');
        }
        setScanError(null);
        return result;
      } catch (error) {
        if (showErrors) {
          setResultBanner(null);
          const mapped = mapScanError(error);
          setScanError(`סריקה נכשלה: ${mapped.message}`);
          track(ANALYTICS_EVENTS.stampFailed, {
            error_code: mapped.code,
            context: 'resolveScan',
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
      selectedBusiness,
      selectedProgram,
    ]
  );

  const commitFromSession = useCallback(
    async (params: {
      session: PendingRedeemSession;
      actionMode: CommitActionMode;
      isFirstStampForCustomer: boolean;
    }) => {
      if (!selectedBusiness || !selectedProgram) {
        return 'business' as const;
      }

      const actionLabel = params.actionMode === 'redeem' ? 'מימוש' : 'ניקוב';
      setIsStamping(true);
      setScanError(null);
      try {
        const commitMutation =
          params.actionMode === 'stamp' ? commitStamp : commitRedeem;
        const result = (await commitMutation({
          scanSessionId: params.session.scanSessionId as Id<'scanSessions'>,
        })) as CommitActionResult;
        applyCommitOutcome({
          session: params.session,
          result,
          actionMode: params.actionMode,
          isFirstStampForCustomer: params.isFirstStampForCustomer,
        });
        return 'success' as const;
      } catch (error) {
        const entitlementError = getEntitlementError(error);
        if (entitlementError) {
          setPendingRedeemSession(null);
          setRetrySession(null);
          setScanError(
            `${actionLabel} נכשל: ${entitlementErrorToHebrewMessage(entitlementError)}`
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
            action_mode: params.actionMode,
          });
          return 'business' as const;
        }

        const mapped = mapScanError(error);
        const technicalError = isTechnicalCommitError(mapped.code);
        if (technicalError) {
          setPendingRedeemSession(null);
          setRetrySession({
            ...params.session,
            actionMode: params.actionMode,
            isFirstStampForCustomer: params.isFirstStampForCustomer,
          });
          setScanError(
            `${actionLabel} מושהה: ${mapped.message} ניתן לנסות שוב בלי לסרוק מחדש.`
          );
        } else {
          setPendingRedeemSession(null);
          setRetrySession(null);
          setScanError(`${actionLabel} נכשל: ${mapped.message}`);
        }
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: mapped.code,
          context: 'commitAction',
          action_mode: params.actionMode,
        });
        return technicalError ? ('technical' as const) : ('business' as const);
      } finally {
        setIsStamping(false);
      }
    },
    [
      applyCommitOutcome,
      commitRedeem,
      commitStamp,
      openUpgrade,
      selectedBusiness,
      selectedProgram,
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
      setPendingRedeemSession(null);
      setRetrySession(null);
      setUndoState(null);

      let shouldQueueReset = true;
      try {
        track(ANALYTICS_EVENTS.qrScannedCustomer, {
          businessId: selectedBusiness?.businessId,
        });

        const resolvedScan = await resolveByToken(data);
        if (!resolvedScan) {
          return;
        }

        const resolvedSession: PendingRedeemSession = {
          scanSessionId: resolvedScan.scanSessionId,
          sessionExpiresAt: resolvedScan.sessionExpiresAt,
          customerUserId: resolvedScan.customerUserId,
          customerDisplayName: resolvedScan.customerDisplayName,
          membership: resolvedScan.membership,
        };

        if (resolvedScan.resolution === 'REDEEM_AVAILABLE') {
          setPendingRedeemSession(resolvedSession);
          setResultBanner(null);
          shouldQueueReset = false;
          return;
        }

        const commitState = await commitFromSession({
          session: resolvedSession,
          actionMode: 'stamp',
          isFirstStampForCustomer: resolvedScan.resolution === 'JOIN_AND_STAMP',
        });
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
      selectedBusiness?.businessId,
    ]
  );

  const handleRedeemCommit = useCallback(async () => {
    if (!pendingRedeemSession || isBusy) {
      return;
    }

    if (Date.now() > pendingRedeemSession.sessionExpiresAt) {
      setPendingRedeemSession(null);
      setRetrySession(null);
      setScanError('פג תוקף הסריקה. יש לסרוק מחדש.');
      queueScannerReset();
      return;
    }

    const commitState = await commitFromSession({
      session: pendingRedeemSession,
      actionMode: 'redeem',
      isFirstStampForCustomer: false,
    });
    if (commitState !== 'technical') {
      queueScannerReset();
    }
  }, [commitFromSession, isBusy, pendingRedeemSession, queueScannerReset]);

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

    const commitState = await commitFromSession({
      session: retrySession,
      actionMode: retrySession.actionMode,
      isFirstStampForCustomer: retrySession.isFirstStampForCustomer,
    });
    if (commitState !== 'technical') {
      queueScannerReset();
    }
  }, [commitFromSession, isBusy, queueScannerReset, retrySession]);

  const handleUndoLastAction = useCallback(async () => {
    if (!undoState?.eventId || !scannerDeviceId || isBusy) {
      return;
    }
    if (Date.now() > undoState.availableUntil) {
      setUndoState(null);
      return;
    }

    const undoCopy = getUndoPresentation(undoState.actionMode);
    setIsUndoing(true);
    setScanError(null);
    try {
      const response = (await undoLastScannerAction({
        eventId: undoState.eventId as Id<'events'>,
        scannerRuntimeSessionId,
        deviceId: scannerDeviceId,
      })) as UndoActionResult;

      const membership = response.membership;
      const undoStatusLabel =
        response.status === 'already_reverted'
          ? undoCopy.alreadyRevertedLabel
          : undoCopy.resultStatusLabel;
      if (membership) {
        setResultBanner({
          customerDisplayName: undoState.customerDisplayName,
          statusLabel: undoStatusLabel,
          currentStamps: membership.currentStamps,
          maxStamps: membership.maxStamps,
        });
      } else {
        setResultBanner(null);
      }
      setSuccessBannerMessage(
        response.status === 'already_reverted'
          ? undoCopy.alreadyRevertedLabel
          : undoCopy.successMessage
      );
      setBusinessSuccessBannerKey((current) => current + 1);
      setRetrySession(null);
      setUndoState(null);
      queueScannerReset();
    } catch {
      setScanError(undoCopy.errorLabel);
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
    (programId: string, index?: number) => {
      if (isSelectionLocked) {
        return;
      }
      if (
        typeof index === 'number' &&
        index >= 0 &&
        index < programs.length &&
        index !== selectedProgramIndex
      ) {
        setVisibleProgramIndex(index);
        programCarouselRef.current?.scrollToOffset({
          offset: index * ITEM_STRIDE,
          animated: true,
        });
        return;
      }
      if (programId === selectedProgramId) {
        return;
      }
      void setSelectedProgram(programId);
      resetScanner();
    },
    [
      isSelectionLocked,
      ITEM_STRIDE,
      programs.length,
      resetScanner,
      selectedProgramId,
      selectedProgramIndex,
      setSelectedProgram,
    ]
  );

  const handleProgramSliderMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isSelectionLocked || programs.length <= 1) {
        return;
      }

      const rawIndex = event.nativeEvent.contentOffset.x / ITEM_STRIDE;
      const nextIndex = Math.min(
        programs.length - 1,
        Math.max(0, Math.round(rawIndex))
      );
      setVisibleProgramIndex(nextIndex);
      const nextProgram = programs[nextIndex];
      if (!nextProgram || nextProgram.loyaltyProgramId === selectedProgramId) {
        return;
      }

      void setSelectedProgram(nextProgram.loyaltyProgramId);
      resetScanner();
    },
    [
      isSelectionLocked,
      ITEM_STRIDE,
      programs,
      resetScanner,
      selectedProgramId,
      setSelectedProgram,
    ]
  );
  const handleProgramDotPress = useCallback(
    (index: number) => {
      const targetProgram = programs[index];
      if (!targetProgram) {
        return;
      }
      handleProgramPress(targetProgram.loyaltyProgramId, index);
    },
    [handleProgramPress, programs]
  );
  const getProgramItemLayout = useCallback(
    (_: ArrayLike<ScannerProgram> | null | undefined, index: number) => ({
      length: ITEM_STRIDE,
      offset: ITEM_STRIDE * index,
      index,
    }),
    [ITEM_STRIDE]
  );
  const handleProgramSliderLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredWidth = Math.round(event.nativeEvent.layout.width);
    setProgramSliderMeasuredWidth((current) => {
      if (Math.abs(current - measuredWidth) <= 1) {
        return current;
      }
      return measuredWidth;
    });
  }, []);

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
        stickyHeaderIndices={[0]}
        ref={scrollViewRef}
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 4}
          backgroundColor="#E9F0FF"
        >
          <View style={styles.header}>
            <BusinessScreenHeader
              title={SCANNER_HEADER_TITLE}
              style={styles.scannerHeaderCompact}
              contentStyle={styles.scannerHeaderContentCompact}
            />
          </View>
        </StickyScrollHeader>

        <View style={[styles.carouselWrap, { width: windowWidth }]}>
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
              <View
                style={styles.programSliderViewport}
                onLayout={handleProgramSliderLayout}
              >
                <FlatList
                  ref={programCarouselRef}
                  horizontal={true}
                  bounces={false}
                  data={programs}
                  keyExtractor={(program) => program.loyaltyProgramId}
                  showsHorizontalScrollIndicator={false}
                  scrollEnabled={!isSelectionLocked && programs.length > 1}
                  snapToAlignment="start"
                  snapToInterval={ITEM_STRIDE}
                  decelerationRate="fast"
                  disableIntervalMomentum={true}
                  inverted={false}
                  removeClippedSubviews={false}
                  style={styles.programSlider}
                  contentContainerStyle={[
                    styles.programSliderContent,
                    { paddingHorizontal: SIDE_PADDING },
                  ]}
                  ItemSeparatorComponent={() => (
                    <View style={{ width: CARD_GAP }} />
                  )}
                  getItemLayout={getProgramItemLayout}
                  onMomentumScrollEnd={handleProgramSliderMomentumEnd}
                  renderItem={({ item, index }) => {
                    const isActive =
                      item.loyaltyProgramId ===
                      selectedProgram?.loyaltyProgramId;
                    return (
                      <View
                        style={[styles.programSlide, { width: CARD_WIDTH }]}
                      >
                        <Pressable
                          onPress={() =>
                            handleProgramPress(item.loyaltyProgramId, index)
                          }
                          disabled={isSelectionLocked}
                          style={({ pressed }) => [
                            styles.programSlidePressable,
                            isActive
                              ? styles.programSlidePressableActive
                              : styles.programSlidePressableInactive,
                            isSelectionLocked ? styles.programCardLocked : null,
                            pressed ? styles.programCardPressed : null,
                          ]}
                        >
                          <ProgramCustomerCardPreview
                            businessName={selectedBusiness?.name ?? item.title}
                            rewardName={item.rewardName}
                            maxStamps={item.maxStamps}
                            title={item.title}
                            programImageUrl={item.imageUrl ?? null}
                            stampIcon={item.stampIcon}
                            stampShape={item.stampShape ?? 'circle'}
                            cardThemeId={item.cardThemeId ?? null}
                            businessLogoUrl={selectedBusiness?.logoUrl ?? null}
                            variant="hero"
                            selected={isActive}
                          />
                        </Pressable>
                      </View>
                    );
                  }}
                />
              </View>
              <View style={styles.programDotsViewport}>
                <View
                  style={[styles.programDotsTrack, { width: dotsTrackWidth }]}
                >
                  {programs.map((program, index) => {
                    const isActive = index === activeProgramDotIndex;
                    return (
                      <View
                        key={`${program.loyaltyProgramId}:dot`}
                        style={styles.programDotSlot}
                      >
                        <Pressable
                          onPress={() => handleProgramDotPress(index)}
                          disabled={isSelectionLocked}
                          hitSlop={6}
                          style={({ pressed }) => [
                            styles.programDotButton,
                            pressed ? styles.programDotButtonPressed : null,
                            isSelectionLocked
                              ? styles.programDotButtonDisabled
                              : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Select card ${program.title}`}
                        >
                          <View style={styles.programDotInner}>
                            <View
                              style={[
                                styles.programDot,
                                isActive ? styles.programDotActive : null,
                              ]}
                            />
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </View>

        <View style={styles.scannerBox}>
          <QrScanner
            onScan={handleScan}
            resetKey={scannerResetKey}
            showStatus={false}
            cameraMinHeight={240}
            isBusy={
              isBusy ||
              !canScan ||
              Boolean(retrySession) ||
              Boolean(pendingRedeemSession)
            }
            onTapWhileScanned={resetScanner}
          />
        </View>

        {pendingRedeemSession ? (
          <View style={styles.redeemRow}>
            <View style={styles.redeemInfoCard}>
              <Text style={styles.redeemInfoTitle}>הלקוח זכאי למימוש</Text>
              <Text style={styles.resultCustomerName}>
                {pendingRedeemSession.customerDisplayName}
              </Text>
              {pendingRedeemSession.membership ? (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>ניקובים</Text>
                  <Text style={styles.resultValue}>
                    {pendingRedeemSession.membership.currentStamps}/
                    {pendingRedeemSession.membership.maxStamps}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.redeemButtonsColumn}>
              <View style={styles.redeemSideBox}>
                <Pressable
                  onPress={handleRedeemCommit}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="ממש הטבה"
                  style={({ pressed }) => [
                    styles.redeemSideButton,
                    pressed ? styles.redeemSideButtonPressed : null,
                    isBusy ? styles.redeemSideButtonDisabled : null,
                  ]}
                >
                  <Ionicons
                    name="gift-outline"
                    size={24}
                    color="#16A34A"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.redeemSideButtonLabel}>
                    {isStamping ? 'מממשים...' : 'ממש הטבה'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.cancelSideBox}>
                <Pressable
                  onPress={resetScanner}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                  style={({ pressed }) => [
                    styles.cancelSideButton,
                    pressed ? styles.cancelSideButtonPressed : null,
                  ]}
                >
                  <Ionicons
                    name="close-outline"
                    size={24}
                    color="#DC2626"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.cancelSideButtonLabel}>ביטול</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

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
          <View style={styles.resultBannerRow}>
            <View style={styles.resultBanner}>
              <Text style={styles.resultCustomerName}>
                {resultBanner.customerDisplayName}
              </Text>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>מעמד</Text>
                <Text style={styles.resultValue}>
                  {resultBanner.statusLabel}
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>ניקובים</Text>
                <Text style={styles.resultValue}>
                  {resultBanner.currentStamps}/{resultBanner.maxStamps}
                </Text>
              </View>
            </View>
            {undoActionActive && undoPresentation ? (
              <View style={styles.undoSideBox}>
                <Pressable
                  onPress={handleUndoLastAction}
                  disabled={isBusy || !undoState?.eventId}
                  accessibilityRole="button"
                  accessibilityLabel={
                    undoPresentation.buttonLabel ?? 'בטל פעולה'
                  }
                  style={({ pressed }) => [
                    styles.undoSideButton,
                    pressed ? styles.undoSideButtonPressed : null,
                    isBusy || !undoState?.eventId
                      ? styles.undoSideButtonDisabled
                      : null,
                  ]}
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={24}
                    color="#DC2626"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.undoSideButtonLabel}>ביטול</Text>
                </Pressable>
              </View>
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
    gap: 8,
  },
  header: {
    gap: 2,
  },
  scannerHeaderCompact: {
    marginBottom: 0,
  },
  scannerHeaderContentCompact: {
    minHeight: 42,
    gap: 2,
  },
  carouselWrap: {
    gap: 10,
    borderRadius: 22,
    marginHorizontal: -20,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  programSliderViewport: {
    width: '100%',
    overflow: 'hidden',
    direction: 'ltr',
  },
  programSlider: {
    width: '100%',
    direction: 'ltr',
  },
  programSliderContent: {
    paddingVertical: 8,
    direction: 'ltr',
    flexDirection: 'row',
  },
  programSlide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  programSlidePressable: {
    width: '100%',
    paddingVertical: 0,
  },
  programSlidePressableActive: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  programSlidePressableInactive: {
    opacity: 0.7,
    transform: [{ scale: 0.93 }],
  },
  programDotsViewport: {
    alignSelf: 'stretch',
    height: 16,
    marginTop: -2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  programDotsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  programDotSlot: {
    width: PROGRAM_DOT_SLOT_WIDTH,
    height: PROGRAM_DOT_SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  programDotButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  programDotButtonPressed: {
    opacity: 0.75,
  },
  programDotButtonDisabled: {
    opacity: 0.6,
  },
  programDotInner: {
    width: PROGRAM_DOT_ACTIVE_WIDTH,
    height: PROGRAM_DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programDot: {
    width: PROGRAM_DOT_SIZE,
    height: PROGRAM_DOT_SIZE,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.36)',
  },
  programDotActive: {
    width: PROGRAM_DOT_ACTIVE_WIDTH,
    backgroundColor: '#000000',
  },
  programCardPressed: {
    opacity: 0.88,
  },
  programCardLocked: {
    opacity: 0.8,
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
    marginTop: -10,
    minHeight: 220,
  },
  redeemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 12,
  },
  redeemInfoCard: {
    flex: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    padding: 16,
    gap: 10,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 3,
  },
  redeemInfoTitle: {
    color: '#1A2B4A',
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'right',
  },
  redeemButtonsColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  redeemSideBox: {
    flex: 1,
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  redeemSideButton: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  redeemSideButtonPressed: {
    opacity: 0.7,
  },
  redeemSideButtonDisabled: {
    opacity: 0.5,
  },
  redeemSideButtonLabel: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  cancelSideBox: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelSideButton: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cancelSideButtonPressed: {
    opacity: 0.7,
  },
  cancelSideButtonLabel: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
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
    marginTop: 2,
    backgroundColor: '#C2410C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#9A3412',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9A3412',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 3,
  },
  undoButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  undoButtonDisabled: {
    opacity: 0.65,
  },
  undoButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },
  resultBannerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 12,
  },
  undoSideBox: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoSideButton: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  undoSideButtonPressed: {
    opacity: 0.7,
  },
  undoSideButtonDisabled: {
    opacity: 0.5,
  },
  undoSideButtonLabel: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  resultBanner: {
    flex: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    padding: 16,
    gap: 10,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 3,
  },
  resultBannerUndoBadge: {
    backgroundColor: '#E0EAFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resultBannerUndoBadgeText: {
    color: '#1E4ED8',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  resultCustomerName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
    writingDirection: 'rtl',
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
  undoCompactAction: {
    marginTop: 2,
    alignSelf: 'flex-end',
    minWidth: 132,
    backgroundColor: '#EAF1FF',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#2F6BFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  undoCompactActionPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  undoCompactActionDisabled: {
    opacity: 0.65,
  },
  undoCompactLabel: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '900',
  },
  undoCompactDot: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
    marginTop: -1,
  },
  undoCompactTimer: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  undoCard: {
    marginTop: 4,
    backgroundColor: '#F7F9FF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E4FF',
    padding: 14,
    gap: 10,
  },
  undoCardTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  undoBadge: {
    backgroundColor: '#E5EDFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  undoBadgeText: {
    color: '#1E3A8A',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  undoCountdownBadge: {
    backgroundColor: '#FFF4DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  undoCountdownText: {
    color: '#9A3412',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  undoCardTitle: {
    color: '#102A56',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  undoCardDescription: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'right',
  },
  undoConfirmationBox: {
    backgroundColor: '#FFF8EA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F4D8A8',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  undoConfirmationText: {
    color: '#7C2D12',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
});
