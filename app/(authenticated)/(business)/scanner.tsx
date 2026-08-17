import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  type ParamListBase,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
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

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import QrScanner from '@/components/QrScanner';
import StickyScrollHeader from '@/components/StickyScrollHeader';
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
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import {
  alignItems,
  flexDirection,
  ltrIslandText,
  selfStart,
} from '@/lib/rtl';
import {
  awaitCurrentTransaction,
  captureTransactionGeneration,
  classifyPosError,
  createInitialPosFlowState,
  invalidateTransactionGeneration,
  isTransactionGenerationCurrent,
  type PosErrorPresentation,
  type PosProgramSnapshot,
  type PosResolvedSession,
  type PosTransactionResult,
  posFlowReducer,
  resolveNoProgramsRecovery,
  resolveSameBusinessProgramRefresh,
  resolveSubscriptionRecovery,
} from '@/lib/scanner/posFlow';
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

type ResolvedScan = {
  scanSessionId: string;
  sessionExpiresAt: number;
  customerUserId: string;
  customerDisplayName: string;
  resolution: 'AUTO_STAMP' | 'REDEEM_AVAILABLE' | 'JOIN_AND_STAMP';
  membership: {
    membershipId: string;
    currentStamps: number;
    maxStamps: number;
    canRedeemNow: boolean;
  } | null;
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
  referralRewardTriggered?: boolean;
  undoBlockedReason?: 'REFERRAL_REWARD_TRIGGERED' | null;
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

type ReferralBenefitItem = {
  rewardId: string;
  businessId: string;
  customerReferralId: string;
  recipientUserId: string;
  recipientRole: 'referrer' | 'referred';
  benefitTitle: string;
  benefitDescription: string | null;
  expiresAt: number | null;
  createdAt: number;
  referrerUserId: string | null;
  referrerName: string | null;
};

const SCANNER_DEVICE_ID_STORAGE_KEY = 'scanner:deviceId';
const FALLBACK_UNDO_WINDOW_MS = 30_000;
const COMPLETE_RESET_MS = 30_000;
const TABLET_BREAKPOINT = 768;
const STALE_PROGRAM_NOTICE =
  'התוכנית שנבחרה כבר אינה זמינה. יש לבחור תוכנית אחרת.';

function generateRuntimeSessionId() {
  return `runtime_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateScannerDeviceId() {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toProgramSnapshot(program: ScannerProgram): PosProgramSnapshot {
  return {
    programId: program.loyaltyProgramId,
    title: program.title,
    rewardName: program.rewardName,
    maxStamps: program.maxStamps,
    allowPosEnroll: program.allowPosEnroll,
  };
}

function formatUndoCountdown(availableUntil: number, now: number) {
  const totalSeconds = Math.max(0, Math.ceil((availableUntil - now) / 1000));
  return `00:${String(totalSeconds).padStart(2, '0')}`;
}

function formatBenefitExpiry(expiresAt: number | null) {
  if (!expiresAt) {
    return 'ללא תוקף';
  }
  return new Date(expiresAt).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  const isStaffRoute = (segments as string[]).includes('(staff)');
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { user } = useUser();
  const {
    activeBusinessId,
    activeBusiness: selectedBusiness,
    isLoading: isBusinessLoading,
  } = useActiveBusiness();

  const [flow, dispatch] = useReducer(
    posFlowReducer,
    createInitialPosFlowState()
  );
  const [scannerRuntimeSessionId, setScannerRuntimeSessionId] = useState(() =>
    generateRuntimeSessionId()
  );
  const [scannerDeviceId, setScannerDeviceId] = useState<string | null>(null);
  const [undoNow, setUndoNow] = useState(() => Date.now());
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedeemingBenefitId, setIsRedeemingBenefitId] = useState<
    string | null
  >(null);
  const [benefitActionMessage, setBenefitActionMessage] = useState<
    string | null
  >(null);
  const completeResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const staleProgramRecoveryRef = useRef(false);
  const previousStorageKeyRef = useRef<string | null>(null);
  const businessIdentityInitializedRef = useRef(false);
  const previousBusinessIdRef = useRef<string | null>(null);
  const selectedProgramIdRef = useRef<string | null>(null);
  const transactionGenerationRef = useRef(0);
  selectedProgramIdRef.current = flow.selectedProgramId;

  const capabilities = selectedBusiness?.capabilities;
  const canAccessScanner = capabilities?.scanner_access === true;
  const canManagePrograms = capabilities?.edit_loyalty_cards === true;
  const canManageSubscription = capabilities?.manage_subscription === true;
  const programsQuery = useQuery(
    api.loyaltyPrograms.listScannerPrograms,
    activeBusinessId && canAccessScanner
      ? { businessId: activeBusinessId }
      : 'skip'
  ) as ScannerProgram[] | undefined;
  const programs = useMemo(() => programsQuery ?? [], [programsQuery]);
  const programIds = useMemo(
    () => programs.map((program) => program.loyaltyProgramId),
    [programs]
  );
  const programIdsSignature = programIds.join('|');
  const programsLoaded = programsQuery !== undefined;
  const selectedProgram =
    programs.find(
      (program) => program.loyaltyProgramId === flow.selectedProgramId
    ) ?? null;
  const storageKey = activeBusinessId
    ? `scanner:lastProgram:${String(activeBusinessId)}`
    : null;
  const referralCustomerId =
    flow.phase === 'success' ? flow.result?.customerUserId : null;
  const referralBenefitsQuery = useQuery(
    api.referrals.listCustomerAvailableReferralBenefits,
    selectedBusiness?.businessId && referralCustomerId
      ? {
          businessId: selectedBusiness.businessId,
          customerUserId: referralCustomerId as Id<'users'>,
          limit: 12,
        }
      : 'skip'
  ) as ReferralBenefitItem[] | undefined;
  const referralBenefits = referralBenefitsQuery ?? [];

  const resolveScan = useMutation(api.scanner.resolveScan);
  const commitStamp = useMutation(api.scanner.commitStamp);
  const commitRedeem = useMutation(api.scanner.commitRedeem);
  const undoLastScannerAction = useMutation(api.scanner.undoLastScannerAction);
  const redeemReferralBenefit = useMutation(
    api.referrals.redeemReferralBenefit
  );

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  useEffect(() => {
    let cancelled = false;
    const hydrateDeviceId = async () => {
      try {
        const existing = await AsyncStorage.getItem(
          SCANNER_DEVICE_ID_STORAGE_KEY
        );
        if (cancelled) {
          return;
        }
        if (existing) {
          setScannerDeviceId(existing);
          return;
        }
        const generated = generateScannerDeviceId();
        await AsyncStorage.setItem(SCANNER_DEVICE_ID_STORAGE_KEY, generated);
        if (!cancelled) {
          setScannerDeviceId(generated);
        }
      } catch {
        if (!cancelled) {
          setScannerDeviceId(generateScannerDeviceId());
        }
      }
    };
    void hydrateDeviceId();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const businessId = activeBusinessId ? String(activeBusinessId) : null;
    if (!businessIdentityInitializedRef.current) {
      if (isBusinessLoading && !businessId) {
        return;
      }
      businessIdentityInitializedRef.current = true;
      previousBusinessIdRef.current = businessId;
      return;
    }
    if (previousBusinessIdRef.current === businessId) {
      return;
    }

    previousBusinessIdRef.current = businessId;
    invalidateTransactionGeneration(transactionGenerationRef);
    if (completeResetTimeoutRef.current) {
      clearTimeout(completeResetTimeoutRef.current);
      completeResetTimeoutRef.current = null;
    }
    staleProgramRecoveryRef.current = false;
    setIsUndoing(false);
    setIsRedeemingBenefitId(null);
    setBenefitActionMessage(null);
    dispatch({ type: 'BUSINESS_CHANGED' });
  }, [activeBusinessId, isBusinessLoading]);

  useLayoutEffect(() => {
    if (!programsLoaded || !storageKey) {
      return;
    }
    const storageChanged = previousStorageKeyRef.current !== storageKey;
    if (storageChanged) {
      previousStorageKeyRef.current = storageKey;
      staleProgramRecoveryRef.current = false;
    }
    if (staleProgramRecoveryRef.current) {
      return;
    }

    let cancelled = false;
    const invalidateStalePreset = () => {
      staleProgramRecoveryRef.current = true;
      invalidateTransactionGeneration(transactionGenerationRef);
      if (completeResetTimeoutRef.current) {
        clearTimeout(completeResetTimeoutRef.current);
        completeResetTimeoutRef.current = null;
      }
      setIsUndoing(false);
      setIsRedeemingBenefitId(null);
      setBenefitActionMessage(null);
      dispatch({
        type: 'CLEAR_STALE_PROGRAM',
        notice: STALE_PROGRAM_NOTICE,
      });
    };
    const hydratePreset = async () => {
      const initialProgramId = storageChanged
        ? null
        : selectedProgramIdRef.current;
      const initialRefreshDecision = resolveSameBusinessProgramRefresh(
        initialProgramId,
        programIds
      );
      if (!storageChanged && initialRefreshDecision === 'preserve') {
        return;
      }
      if (!storageChanged && initialRefreshDecision === 'stale') {
        invalidateStalePreset();
        try {
          await AsyncStorage.removeItem(storageKey);
        } catch {
          // The invalid preset is still ignored in local state.
        }
        return;
      }

      let savedProgramId: string | null = null;
      try {
        savedProgramId = await AsyncStorage.getItem(storageKey);
      } catch {
        savedProgramId = null;
      }
      if (cancelled) {
        return;
      }
      const currentProgramId = storageChanged
        ? null
        : selectedProgramIdRef.current;
      const refreshDecision = resolveSameBusinessProgramRefresh(
        currentProgramId,
        programIds
      );
      if (!storageChanged && refreshDecision === 'preserve') {
        return;
      }
      if (!storageChanged && refreshDecision === 'stale') {
        invalidateStalePreset();
        try {
          await AsyncStorage.removeItem(storageKey);
        } catch {
          // The invalid preset is still ignored in local state.
        }
        return;
      }
      const savedPresetIsValid = Boolean(
        savedProgramId && programIds.includes(savedProgramId)
      );
      const savedPresetIsStale = Boolean(
        savedProgramId && !savedPresetIsValid
      );
      if (savedPresetIsStale) {
        invalidateStalePreset();
        try {
          await AsyncStorage.removeItem(storageKey);
        } catch {
          // The invalid preset is still ignored in local state.
        }
        return;
      }
      if (!cancelled) {
        dispatch({
          type: 'PROGRAMS_READY',
          programIds,
          savedProgramId:
            currentProgramId && programIds.includes(currentProgramId)
              ? currentProgramId
              : savedPresetIsValid
                ? savedProgramId
                : null,
        });
      }
    };
    void hydratePreset();
    return () => {
      cancelled = true;
    };
  }, [programIdsSignature, programsLoaded, storageKey]);

  const clearCompleteResetTimer = useCallback(() => {
    if (completeResetTimeoutRef.current) {
      clearTimeout(completeResetTimeoutRef.current);
      completeResetTimeoutRef.current = null;
    }
  }, []);

  const resetForNextCustomer = useCallback(() => {
    invalidateTransactionGeneration(transactionGenerationRef);
    clearCompleteResetTimer();
    setIsUndoing(false);
    setIsRedeemingBenefitId(null);
    setBenefitActionMessage(null);
    dispatch({ type: 'NEXT_CUSTOMER' });
  }, [clearCompleteResetTimer]);

  const queueCompleteReset = useCallback(
    (delayMs = COMPLETE_RESET_MS) => {
      clearCompleteResetTimer();
      completeResetTimeoutRef.current = setTimeout(() => {
        invalidateTransactionGeneration(transactionGenerationRef);
        setIsUndoing(false);
        setIsRedeemingBenefitId(null);
        setBenefitActionMessage(null);
        dispatch({ type: 'NEXT_CUSTOMER' });
        completeResetTimeoutRef.current = null;
      }, Math.max(0, delayMs));
    },
    [clearCompleteResetTimer]
  );

  useFocusEffect(
    useCallback(() => {
      setScannerRuntimeSessionId(generateRuntimeSessionId());
      resetForNextCustomer();
    }, [resetForNextCustomer])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      setScannerRuntimeSessionId(generateRuntimeSessionId());
      resetForNextCustomer();
    });
    return unsubscribe;
  }, [navigation, resetForNextCustomer]);

  useLayoutEffect(() => {
    return () => {
      invalidateTransactionGeneration(transactionGenerationRef);
      clearCompleteResetTimer();
    };
  }, [clearCompleteResetTimer]);

  const undoAvailableUntil = flow.result?.undo?.availableUntil ?? null;
  useEffect(() => {
    if (!undoAvailableUntil) {
      return;
    }
    setUndoNow(Date.now());
    const interval = setInterval(() => {
      const now = Date.now();
      setUndoNow(now);
      if (now >= undoAvailableUntil) {
        dispatch({ type: 'EXPIRE_UNDO' });
      }
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [undoAvailableUntil]);

  const selectProgram = useCallback(
    async (programId: string) => {
      if (!storageKey) {
        return;
      }
      staleProgramRecoveryRef.current = false;
      invalidateTransactionGeneration(transactionGenerationRef);
      clearCompleteResetTimer();
      dispatch({ type: 'SELECT_PROGRAM', programId });
      try {
        await AsyncStorage.setItem(storageKey, programId);
      } catch {
        // The counter preset remains active for this app session.
      }
    },
    [clearCompleteResetTimer, storageKey]
  );

  const changeProgram = useCallback(async () => {
    if (!storageKey) {
      return;
    }
    clearCompleteResetTimer();
    invalidateTransactionGeneration(transactionGenerationRef);
    setBenefitActionMessage(null);
    dispatch({ type: 'CHANGE_PROGRAM' });
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch {
      // Local state still requires an explicit new selection.
    }
  }, [clearCompleteResetTimer, storageKey]);

  const recoverFromStaleProgram = useCallback(
    async (message: string) => {
      staleProgramRecoveryRef.current = true;
      invalidateTransactionGeneration(transactionGenerationRef);
      clearCompleteResetTimer();
      setBenefitActionMessage(null);
      dispatch({ type: 'CLEAR_STALE_PROGRAM', notice: message });
      if (storageKey) {
        try {
          await AsyncStorage.removeItem(storageKey);
        } catch {
          // Local state still clears the unavailable preset.
        }
      }
    },
    [clearCompleteResetTimer, storageKey]
  );

  const showTerminalError = useCallback(
    async (error: PosErrorPresentation, generation: number) => {
      if (
        !isTransactionGenerationCurrent(
          transactionGenerationRef,
          generation
        )
      ) {
        return;
      }
      if (error.kind === 'stale_program') {
        await recoverFromStaleProgram(error.message);
        return;
      }
      dispatch({ type: 'SHOW_TERMINAL_ERROR', error });
    },
    [recoverFromStaleProgram]
  );

  const applyCommitOutcome = useCallback(
    (
      session: PosResolvedSession,
      result: CommitActionResult
    ): PosTransactionResult => {
      const now = Date.now();
      const undoBlocked =
        result.undoBlockedReason === 'REFERRAL_REWARD_TRIGGERED' ||
        result.referralRewardTriggered === true;
      const availableUntil =
        typeof result.undoAvailableUntil === 'number' &&
        result.undoAvailableUntil > now
          ? result.undoAvailableUntil
          : now + FALLBACK_UNDO_WINDOW_MS;
      return {
        customerUserId: session.customerUserId,
        customerDisplayName: session.customerDisplayName,
        program: session.program,
        actionMode: session.actionMode,
        joinedCustomer: session.joinedCustomer,
        currentStamps: result.currentStamps,
        maxStamps: result.maxStamps,
        canRedeemNow: result.canRedeemNow,
        undo: undoBlocked
          ? null
          : {
              eventId: result.eventId,
              availableUntil,
              actionMode: session.actionMode,
            },
        undoBlockedReason: undoBlocked ? 'REFERRAL_REWARD_TRIGGERED' : null,
      };
    },
    []
  );

  const commitFromSession = useCallback(
    async (session: PosResolvedSession, generation: number) => {
      if (
        !isTransactionGenerationCurrent(
          transactionGenerationRef,
          generation
        )
      ) {
        return;
      }
      dispatch({ type: 'BEGIN_RESOLVE' });
      try {
        const mutation =
          session.actionMode === 'stamp' ? commitStamp : commitRedeem;
        const guardedResult = await awaitCurrentTransaction(
          transactionGenerationRef,
          generation,
          async () =>
            (await mutation({
              scanSessionId: session.scanSessionId as Id<'scanSessions'>,
            })) as CommitActionResult
        );
        if (guardedResult.status === 'stale') {
          return;
        }
        const result = guardedResult.value;
        const transactionResult = applyCommitOutcome(session, result);
        dispatch({ type: 'SHOW_SUCCESS', result: transactionResult });
        Vibration.vibrate(120);

        const resetAt = transactionResult.undo?.availableUntil ??
          Date.now() + COMPLETE_RESET_MS;
        queueCompleteReset(resetAt - Date.now());

        track(ANALYTICS_EVENTS.stampSuccess, {
          businessId: selectedBusiness?.businessId ?? null,
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
          if (session.joinedCustomer) {
            void trackActivationEvent(
              ANALYTICS_EVENTS.customerFirstStampReceived,
              { role: 'client', userId: session.customerUserId }
            );
          }
        }
      } catch (error) {
        if (
          !isTransactionGenerationCurrent(
            transactionGenerationRef,
            generation
          )
        ) {
          return;
        }
        const entitlement = getEntitlementError(error);
        const presentation = entitlement
          ? {
              ...classifyPosError(new Error(entitlement.code), 'commit'),
              message: entitlementErrorToHebrewMessage(entitlement),
            }
          : classifyPosError(error, 'commit');
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: presentation.code,
          context: 'commitAction',
          action_mode: session.actionMode,
        });
        if (
          presentation.retrySameSession &&
          Date.now() <= session.sessionExpiresAt
        ) {
          dispatch({
            type: 'SHOW_TECHNICAL_RETRY',
            session,
            error: presentation,
          });
          return;
        }
        await showTerminalError(presentation, generation);
      }
    },
    [
      applyCommitOutcome,
      commitRedeem,
      commitStamp,
      queueCompleteReset,
      selectedBusiness?.businessId,
      showTerminalError,
      user?._id,
    ]
  );

  const handleScan = useCallback(
    async (rawData: string) => {
      if (
        flow.phase !== 'ready' ||
        !selectedBusiness ||
        !selectedProgram ||
        !scannerDeviceId ||
        !canAccessScanner
      ) {
        return;
      }
      const generation = captureTransactionGeneration(
        transactionGenerationRef
      );
      const qrData = rawData.trim();
      if (!qrData.startsWith('scanToken:')) {
        await showTerminalError(
          classifyPosError(new Error('INVALID_QR'), 'resolve'),
          generation
        );
        return;
      }

      dispatch({ type: 'BEGIN_RESOLVE' });
      setBenefitActionMessage(null);
      try {
        track(ANALYTICS_EVENTS.qrScannedCustomer, {
          businessId: selectedBusiness.businessId,
        });
        const guardedResolved = await awaitCurrentTransaction(
          transactionGenerationRef,
          generation,
          async () =>
            (await resolveScan({
              qrData,
              businessId: selectedBusiness.businessId,
              programId:
                selectedProgram.loyaltyProgramId as Id<'loyaltyPrograms'>,
              scannerRuntimeSessionId,
              deviceId: scannerDeviceId,
            })) as ResolvedScan
        );
        if (guardedResolved.status === 'stale') {
          return;
        }
        const resolved = guardedResolved.value;
        const session: PosResolvedSession = {
          scanSessionId: resolved.scanSessionId,
          sessionExpiresAt: resolved.sessionExpiresAt,
          customerUserId: resolved.customerUserId,
          customerDisplayName: resolved.customerDisplayName,
          membership: resolved.membership,
          program: toProgramSnapshot(selectedProgram),
          actionMode:
            resolved.resolution === 'REDEEM_AVAILABLE' ? 'redeem' : 'stamp',
          joinedCustomer: resolved.resolution === 'JOIN_AND_STAMP',
        };
        if (resolved.resolution === 'REDEEM_AVAILABLE') {
          dispatch({ type: 'SHOW_REDEEM_CONFIRMATION', session });
          return;
        }
        await commitFromSession(session, generation);
      } catch (error) {
        if (
          !isTransactionGenerationCurrent(
            transactionGenerationRef,
            generation
          )
        ) {
          return;
        }
        const presentation = classifyPosError(error, 'resolve');
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: presentation.code,
          context: 'resolveScan',
        });
        await showTerminalError(presentation, generation);
      }
    },
    [
      canAccessScanner,
      commitFromSession,
      flow.phase,
      resolveScan,
      scannerDeviceId,
      scannerRuntimeSessionId,
      selectedBusiness,
      selectedProgram,
      showTerminalError,
    ]
  );

  const handleRedeem = useCallback(async () => {
    if (flow.phase !== 'redeem_confirmation' || !flow.session) {
      return;
    }
    const generation = captureTransactionGeneration(transactionGenerationRef);
    if (Date.now() > flow.session.sessionExpiresAt) {
      await showTerminalError(
        classifyPosError(new Error('SCAN_SESSION_EXPIRED'), 'commit'),
        generation
      );
      return;
    }
    await commitFromSession(flow.session, generation);
  }, [commitFromSession, flow.phase, flow.session, showTerminalError]);

  const handleRetry = useCallback(async () => {
    if (flow.phase !== 'technical_retry' || !flow.session) {
      return;
    }
    const generation = captureTransactionGeneration(transactionGenerationRef);
    if (Date.now() > flow.session.sessionExpiresAt) {
      await showTerminalError(
        classifyPosError(new Error('SCAN_SESSION_EXPIRED'), 'commit'),
        generation
      );
      return;
    }
    await commitFromSession(flow.session, generation);
  }, [commitFromSession, flow.phase, flow.session, showTerminalError]);

  const handleUndo = useCallback(async () => {
    const currentResult = flow.result;
    const undo = currentResult?.undo;
    if (!currentResult || !undo || !scannerDeviceId || isUndoing) {
      return;
    }
    if (Date.now() > undo.availableUntil) {
      dispatch({ type: 'EXPIRE_UNDO' });
      return;
    }

    setIsUndoing(true);
    const requestGeneration = captureTransactionGeneration(
      transactionGenerationRef
    );
    try {
      const response = (await undoLastScannerAction({
        eventId: undo.eventId as Id<'events'>,
        scannerRuntimeSessionId,
        deviceId: scannerDeviceId,
      })) as UndoActionResult;
      if (requestGeneration !== transactionGenerationRef.current) {
        return;
      }
      const membership = response.membership;
      const reversedResult: PosTransactionResult = {
        ...currentResult,
        joinedCustomer: false,
        currentStamps: membership?.currentStamps ?? currentResult.currentStamps,
        maxStamps: membership?.maxStamps ?? currentResult.maxStamps,
        canRedeemNow: membership?.canRedeemNow ?? false,
        undo: null,
        undoBlockedReason: null,
      };
      dispatch({ type: 'SHOW_REVERSED', result: reversedResult });
      Vibration.vibrate(120);
      queueCompleteReset();
    } catch (error) {
      if (requestGeneration !== transactionGenerationRef.current) {
        return;
      }
      await showTerminalError(
        classifyPosError(error, 'undo'),
        requestGeneration
      );
    } finally {
      if (requestGeneration === transactionGenerationRef.current) {
        setIsUndoing(false);
      }
    }
  }, [
    flow.result,
    isUndoing,
    queueCompleteReset,
    scannerDeviceId,
    scannerRuntimeSessionId,
    showTerminalError,
    undoLastScannerAction,
  ]);

  const handleRedeemReferralBenefit = useCallback(
    async (rewardId: string) => {
      if (
        flow.phase !== 'success' ||
        !selectedBusiness?.businessId ||
        !scannerDeviceId ||
        isRedeemingBenefitId
      ) {
        return;
      }
      const requestGeneration = captureTransactionGeneration(
        transactionGenerationRef
      );
      setIsRedeemingBenefitId(rewardId);
      setBenefitActionMessage(null);
      try {
        await redeemReferralBenefit({
          businessId: selectedBusiness.businessId,
          rewardId: rewardId as Id<'referralRewards'>,
          scannerRuntimeSessionId,
          deviceId: scannerDeviceId,
        });
        if (requestGeneration !== transactionGenerationRef.current) {
          return;
        }
        setBenefitActionMessage('הטבת ההפניה מומשה בהצלחה.');
        Vibration.vibrate(120);
      } catch {
        if (requestGeneration !== transactionGenerationRef.current) {
          return;
        }
        setBenefitActionMessage('לא ניתן לממש את הטבת ההפניה כרגע.');
      } finally {
        if (requestGeneration === transactionGenerationRef.current) {
          setIsRedeemingBenefitId(null);
        }
      }
    },
    [
      flow.phase,
      isRedeemingBenefitId,
      redeemReferralBenefit,
      scannerDeviceId,
      scannerRuntimeSessionId,
      selectedBusiness?.businessId,
    ]
  );

  const openPlanManagement = useCallback(() => {
    if (!canManageSubscription) {
      return;
    }
    openSubscriptionComparison(router, {
      featureKey: 'maxCustomers',
      requiredPlan: 'pro',
      reason: 'limit_reached',
    });
  }, [canManageSubscription, router]);

  const renderProgramContext = () => {
    if (!isBusinessLoading && selectedBusiness && !canAccessScanner) {
      return (
        <View style={styles.programContextCard}>
          <Text style={styles.programContextTitle}>אין הרשאה לסריקה</Text>
          <Text style={styles.programContextMuted}>
            יש לפנות לבעל העסק או למנהל כדי להסדיר הרשאה.
          </Text>
        </View>
      );
    }
    if (
      isBusinessLoading ||
      (canAccessScanner && programsQuery === undefined)
    ) {
      return (
        <View style={styles.programContextCard}>
          <ActivityIndicator size="small" color="#2F6BFF" />
          <Text style={styles.programContextMuted}>טוענים תוכניות...</Text>
        </View>
      );
    }
    if (programs.length === 0) {
      const recovery = resolveNoProgramsRecovery(canManagePrograms);
      return (
        <View style={styles.programContextCard}>
          <Text style={styles.programContextTitle}>
            אין תוכנית פעילה לסריקה
          </Text>
          <Text style={styles.programContextMuted}>
            {recovery === 'manage_programs'
              ? 'יש להפעיל תוכנית לפני תחילת העבודה בקופה.'
              : 'יש לפנות לבעל העסק או למנהל כדי להפעיל תוכנית.'}
          </Text>
          {recovery === 'manage_programs' ? (
            <Pressable
              onPress={() => router.push('/(authenticated)/(business)/cards')}
              accessibilityRole="button"
              accessibilityLabel="ניהול תוכניות"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>ניהול תוכניות</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    if (flow.phase === 'needs_program' || !selectedProgram) {
      return (
        <View style={styles.programContextCard}>
          <Text style={styles.programContextTitle}>בחירת תוכנית לקופה</Text>
          <Text style={styles.programContextMuted}>
            הבחירה תישמר גם ללקוחות הבאים.
          </Text>
          {flow.notice ? (
            <Text style={styles.programNotice}>{flow.notice}</Text>
          ) : null}
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            style={styles.programOptionsScroll}
            contentContainerStyle={styles.programOptions}
          >
            {programs.map((program) => (
              <Pressable
                key={program.loyaltyProgramId}
                onPress={() => void selectProgram(program.loyaltyProgramId)}
                accessibilityRole="button"
                accessibilityLabel={`בחירת תוכנית ${program.title}`}
                style={({ pressed }) => [
                  styles.programOption,
                  pressed ? styles.buttonPressed : null,
                ]}
              >
                <Text style={styles.programOptionTitle}>{program.title}</Text>
                <Text style={styles.programOptionReward} numberOfLines={1}>
                  {program.rewardName}
                </Text>
                {!program.allowPosEnroll ? (
                  <Text style={styles.existingCustomersBadge}>
                    ללקוחות קיימים בלבד
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      );
    }
    return (
      <View style={styles.programContextCard}>
        <View style={styles.programContextTopRow}>
          <View style={styles.programContextText}>
            <Text style={styles.programEyebrow}>תוכנית פעילה בקופה</Text>
            <Text style={styles.programContextTitle}>{selectedProgram.title}</Text>
            <Text style={styles.programContextMuted} numberOfLines={1}>
              הטבה: {selectedProgram.rewardName}
            </Text>
            {!selectedProgram.allowPosEnroll ? (
              <Text style={styles.existingCustomersBadge}>
                ללקוחות קיימים בלבד
              </Text>
            ) : null}
          </View>
          {programs.length > 1 && flow.phase === 'ready' ? (
            <Pressable
              onPress={() => void changeProgram()}
              accessibilityRole="button"
              accessibilityLabel="החלפת תוכנית"
              style={styles.changeProgramButton}
            >
              <Ionicons name="swap-horizontal" size={18} color="#1D4ED8" />
              <Text style={styles.changeProgramText}>החלפה</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const renderResultDetails = (result: PosTransactionResult) => {
    const actionText =
      flow.phase === 'reversed'
        ? result.actionMode === 'redeem'
          ? 'מימוש ההטבה בוטל'
          : 'הניקוב האחרון בוטל'
        : result.joinedCustomer
          ? 'הלקוח הצטרף וקיבל ניקוב ראשון'
          : result.actionMode === 'redeem'
            ? `${result.program.rewardName} מומשה בהצלחה`
            : 'נוסף ניקוב בהצלחה';
    return (
      <>
        <View style={styles.successIcon}>
          <Ionicons
            name={flow.phase === 'reversed' ? 'arrow-undo' : 'checkmark'}
            size={30}
            color="#FFFFFF"
          />
        </View>
        <Text style={styles.resultCustomer}>{result.customerDisplayName}</Text>
        <Text style={styles.resultProgram}>{result.program.title}</Text>
        <Text style={styles.resultAction}>{actionText}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>מצב הכרטיס</Text>
          <Text style={styles.progressValue}>
            {result.currentStamps}/{result.maxStamps}
          </Text>
        </View>
        {result.canRedeemNow && result.actionMode === 'stamp' ? (
          <Text style={styles.rewardReadyText}>
            ההטבה {result.program.rewardName} מוכנה למימוש
          </Text>
        ) : null}
        {result.undoBlockedReason === 'REFERRAL_REWARD_TRIGGERED' ? (
          <Text style={styles.undoBlockedText}>
            לא ניתן לבטל את הניקוב מפני שהוא כבר הפעיל תגמול הפניה.
          </Text>
        ) : null}
        <Pressable
          onPress={resetForNextCustomer}
          accessibilityRole="button"
          accessibilityLabel="הלקוח הבא"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>הלקוח הבא</Text>
        </Pressable>
        {result.undo && undoNow < result.undo.availableUntil ? (
          <Pressable
            onPress={() => void handleUndo()}
            disabled={isUndoing}
            accessibilityRole="button"
            accessibilityLabel="ביטול הפעולה האחרונה"
            style={({ pressed }) => [
              styles.undoButton,
              pressed ? styles.buttonPressed : null,
              isUndoing ? styles.buttonDisabled : null,
            ]}
          >
            <Ionicons name="arrow-undo-outline" size={18} color="#1D4ED8" />
            <Text style={styles.undoButtonText}>
              {isUndoing ? 'מבטלים...' : 'ביטול פעולה'}
            </Text>
            <Text style={styles.undoTimer}>
              {formatUndoCountdown(result.undo.availableUntil, undoNow)}
            </Text>
          </Pressable>
        ) : null}
      </>
    );
  };

  const renderStatusRail = () => {
    if (!isBusinessLoading && selectedBusiness && !canAccessScanner) {
      return (
        <View style={styles.statusContent}>
          <Ionicons name="lock-closed-outline" size={34} color="#B42318" />
          <Text style={styles.statusTitle}>אין הרשאה לסריקה</Text>
          <Text style={styles.statusBody}>
            יש לפנות לבעל העסק או למנהל כדי להסדיר הרשאה.
          </Text>
        </View>
      );
    }
    if (
      isBusinessLoading ||
      (canAccessScanner && programsQuery === undefined) ||
      !scannerDeviceId
    ) {
      return (
        <View style={styles.statusContent}>
          <ActivityIndicator size="large" color="#2F6BFF" />
          <Text style={styles.statusTitle}>מכינים את הסורק...</Text>
        </View>
      );
    }
    if (programs.length === 0 || flow.phase === 'needs_program') {
      return (
        <View style={styles.statusContent}>
          <Ionicons name="albums-outline" size={34} color="#2F6BFF" />
          <Text style={styles.statusTitle}>
            {programs.length === 0 ? 'אין תוכנית לסריקה' : 'בחרו תוכנית תחילה'}
          </Text>
          <Text style={styles.statusBody}>
            הסורק יופעל מיד לאחר בחירת תוכנית לקופה.
          </Text>
        </View>
      );
    }
    if (flow.phase === 'ready') {
      return (
        <View style={styles.statusContent}>
          <Ionicons name="qr-code-outline" size={34} color="#2F6BFF" />
          <Text style={styles.statusTitle}>מוכנים לסריקה</Text>
          <Text style={styles.statusBody}>
            מקמו את קוד ה-QR של הלקוח בתוך המסגרת.
          </Text>
        </View>
      );
    }
    if (flow.phase === 'resolving') {
      return (
        <View style={styles.statusContent}>
          <ActivityIndicator size="large" color="#2F6BFF" />
          <Text style={styles.statusTitle}>מעבדים את הסריקה...</Text>
          <Text style={styles.statusBody}>הפעולה תושלם בעוד רגע.</Text>
        </View>
      );
    }
    if (flow.phase === 'redeem_confirmation' && flow.session) {
      return (
        <View style={styles.statusContent}>
          <Ionicons name="gift-outline" size={36} color="#15803D" />
          <Text style={styles.resultCustomer}>
            {flow.session.customerDisplayName}
          </Text>
          <Text style={styles.resultProgram}>{flow.session.program.title}</Text>
          <Text style={styles.statusTitle}>הטבה מוכנה למימוש</Text>
          {flow.session.membership ? (
            <Text style={styles.statusBody}>
              {flow.session.membership.currentStamps}/
              {flow.session.membership.maxStamps} ניקובים
            </Text>
          ) : null}
          <Pressable
            onPress={() => void handleRedeem()}
            accessibilityRole="button"
            accessibilityLabel={`מימוש ${flow.session.program.rewardName}`}
            style={({ pressed }) => [
              styles.redeemButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              מימוש {flow.session.program.rewardName}
            </Text>
          </Pressable>
          <Pressable
            onPress={resetForNextCustomer}
            accessibilityRole="button"
            accessibilityLabel="ביטול ומעבר ללקוח הבא"
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>ביטול והלקוח הבא</Text>
          </Pressable>
        </View>
      );
    }
    if (flow.phase === 'technical_retry' && flow.error) {
      return (
        <View style={styles.statusContent}>
          <Ionicons name="cloud-offline-outline" size={36} color="#B54708" />
          <Text style={styles.statusTitle}>הפעולה טרם הושלמה</Text>
          <Text style={styles.statusBody}>{flow.error.message}</Text>
          <Pressable
            onPress={() => void handleRetry()}
            accessibilityRole="button"
            accessibilityLabel="נסה שוב"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>נסה שוב</Text>
          </Pressable>
          <Pressable
            onPress={resetForNextCustomer}
            accessibilityRole="button"
            accessibilityLabel="ביטול ומעבר לסריקה חדשה"
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>ביטול וסריקה חדשה</Text>
          </Pressable>
        </View>
      );
    }
    if (flow.phase === 'terminal_error' && flow.error) {
      const subscriptionRecovery = resolveSubscriptionRecovery(
        canManageSubscription
      );
      const canOfferProgramChange =
        flow.error.canChangeProgram && programs.length > 1;
      return (
        <View style={styles.statusContent}>
          <Ionicons name="alert-circle-outline" size={38} color="#B42318" />
          <Text style={styles.statusTitle}>לא ניתן להשלים את הפעולה</Text>
          <Text style={styles.statusBody}>{flow.error.message}</Text>
          {flow.error.kind === 'entitlement' &&
          subscriptionRecovery === 'contact_owner' ? (
            <Text style={styles.ownerGuidance}>
              בעל העסק צריך להסדיר את המסלול לפני צירוף לקוחות חדשים.
            </Text>
          ) : null}
          {flow.error.kind === 'entitlement' &&
          subscriptionRecovery === 'manage_subscription' ? (
            <Pressable
              onPress={openPlanManagement}
              accessibilityRole="button"
              accessibilityLabel="בדיקת המסלול"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>בדיקת המסלול</Text>
            </Pressable>
          ) : null}
          {canOfferProgramChange ? (
            <Pressable
              onPress={() => void changeProgram()}
              accessibilityRole="button"
              accessibilityLabel="החלפת תוכנית"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>החלפת תוכנית</Text>
            </Pressable>
          ) : null}
          {flow.error.kind !== 'business_closed' ? (
            <Pressable
              onPress={resetForNextCustomer}
              accessibilityRole="button"
              accessibilityLabel="סריקה חדשה"
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {flow.error.kind === 'pos_enroll_disabled'
                  ? 'הלקוח הבא'
                  : 'סריקה חדשה'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    if (
      (flow.phase === 'success' || flow.phase === 'reversed') &&
      flow.result
    ) {
      return (
        <View style={styles.statusContent}>
          {renderResultDetails(flow.result)}
          {flow.phase === 'success' &&
          (referralBenefits.length > 0 || benefitActionMessage) ? (
            <View style={styles.referralSection}>
              <Pressable
                onPress={() => dispatch({ type: 'TOGGLE_REFERRALS' })}
                accessibilityRole="button"
                accessibilityLabel="הצגת הטבת הפניה זמינה"
                style={styles.referralDisclosure}
              >
                <Ionicons name="ticket-outline" size={18} color="#166534" />
                <Text style={styles.referralDisclosureText}>
                  יש הטבת הפניה זמינה
                </Text>
                <Ionicons
                  name={flow.referralExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#166534"
                />
              </Pressable>
              {benefitActionMessage ? (
                <Text style={styles.referralMessage}>
                  {benefitActionMessage}
                </Text>
              ) : null}
              {flow.referralExpanded
                ? referralBenefits.map((benefit) => (
                    <View key={benefit.rewardId} style={styles.referralRow}>
                      <View style={styles.referralText}>
                        <Text style={styles.referralTitle}>
                          {benefit.benefitTitle}
                        </Text>
                        <Text style={styles.referralMeta}>
                          תוקף: {formatBenefitExpiry(benefit.expiresAt)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          void handleRedeemReferralBenefit(benefit.rewardId)
                        }
                        disabled={isRedeemingBenefitId !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`מימוש ${benefit.benefitTitle}`}
                        style={styles.referralRedeemButton}
                      >
                        <Text style={styles.referralRedeemText}>
                          {isRedeemingBenefitId === benefit.rewardId
                            ? 'מממשים...'
                            : 'מימוש'}
                        </Text>
                      </Pressable>
                    </View>
                  ))
                : null}
            </View>
          ) : null}
        </View>
      );
    }
    return null;
  };

  const shouldShowCamera = Boolean(
    selectedProgram &&
      scannerDeviceId &&
      canAccessScanner &&
      (flow.phase === 'ready' ||
        (isTablet &&
          flow.phase !== 'setup' &&
          flow.phase !== 'needs_program'))
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: (insets.bottom || 0) + 24 },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 4}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="סריקת לקוח"
            subtitle={isStaffRoute ? selectedBusiness?.name : undefined}
            style={styles.header}
            contentStyle={styles.headerContent}
          />
        </StickyScrollHeader>

        <View style={styles.contentFrame}>
          {renderProgramContext()}
          <View
            style={[
              styles.transactionArea,
              isTablet ? styles.transactionAreaTablet : null,
            ]}
          >
            {shouldShowCamera ? (
              <View
                style={[
                  styles.cameraPane,
                  isTablet ? styles.cameraPaneTablet : null,
                ]}
              >
                <QrScanner
                  onScan={handleScan}
                  resetKey={flow.scannerResetKey}
                  showStatus={false}
                  cameraMinHeight={isTablet ? 360 : 260}
                  isBusy={flow.phase !== 'ready'}
                />
                {flow.phase === 'resolving' ? (
                  <View pointerEvents="none" style={styles.cameraBusyOverlay}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.cameraBusyText}>מעבדים...</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {isTablet || !shouldShowCamera ? (
              <View
                style={[
                  styles.statusRail,
                  isTablet ? styles.statusRailTablet : null,
                ]}
              >
                {renderStatusRail()}
              </View>
            ) : null}
          </View>
        </View>
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
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  header: {
    marginBottom: 0,
  },
  headerContent: {
    minHeight: 42,
    gap: 2,
  },
  contentFrame: {
    width: '100%',
    gap: 12,
  },
  programContextCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
    alignItems: alignItems.start,
  },
  programContextTopRow: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  programContextText: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 2,
  },
  programEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  programContextTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#14213D',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  programContextMuted: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  programNotice: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  existingCustomersBadge: {
    alignSelf: selfStart,
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    color: '#9A3412',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  changeProgramButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  changeProgramText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
  },
  programOptionsScroll: {
    width: '100%',
  },
  programOptions: {
    flexDirection: flexDirection.row,
    gap: 10,
    paddingVertical: 2,
  },
  programOption: {
    width: 190,
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#F8FAFF',
    padding: 12,
    gap: 4,
    alignItems: alignItems.start,
  },
  programOptionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#14213D',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  programOptionReward: {
    maxWidth: '100%',
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  transactionArea: {
    width: '100%',
    minHeight: 260,
  },
  transactionAreaTablet: {
    flexDirection: flexDirection.row,
    alignItems: 'stretch',
    gap: 16,
  },
  cameraPane: {
    width: '100%',
    minHeight: 260,
    position: 'relative',
  },
  cameraPaneTablet: {
    flex: 1.55,
    maxWidth: 560,
    minHeight: 360,
  },
  cameraBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: 'rgba(15,23,42,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  cameraBusyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  statusRail: {
    width: '100%',
    minHeight: 260,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  statusRailTablet: {
    flex: 1,
    minWidth: 300,
    maxWidth: 360,
    minHeight: 360,
  },
  statusContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusTitle: {
    width: '100%',
    fontSize: 18,
    fontWeight: '900',
    color: '#14213D',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  statusBody: {
    width: '100%',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  resultCustomer: {
    width: '100%',
    fontSize: 22,
    fontWeight: '900',
    color: '#14213D',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  resultProgram: {
    width: '100%',
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  resultAction: {
    width: '100%',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '900',
    color: '#166534',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  successIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  progressValue: {
    ...ltrIslandText,
    color: '#14213D',
    fontSize: 15,
    fontWeight: '900',
  },
  rewardReadyText: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#ECFDF3',
    color: '#166534',
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  undoBlockedText: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    color: '#B42318',
    fontSize: 11,
    fontWeight: '700',
    padding: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  redeemButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    minHeight: 44,
    alignSelf: selfStart,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  textButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  undoButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  undoButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
  },
  undoTimer: {
    ...ltrIslandText,
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  ownerGuidance: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '800',
    padding: 9,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  referralSection: {
    width: '100%',
    gap: 8,
  },
  referralDisclosure: {
    width: '100%',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  referralDisclosureText: {
    flex: 1,
    color: '#166534',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  referralMessage: {
    width: '100%',
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  referralRow: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 9,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  referralText: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 2,
  },
  referralTitle: {
    color: '#14213D',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  referralMeta: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  referralRedeemButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#16A34A',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralRedeemText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
