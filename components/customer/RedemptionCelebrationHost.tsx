import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RedemptionCelebration from '@/components/customer/RedemptionCelebration';
import { api } from '@/convex/_generated/api';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { playRedemptionCelebrationFeedback } from '@/lib/feedback';
import {
  isRedemptionCelebrationForeground,
  rememberConsumedCelebration,
  shouldClaimRedemptionCelebration,
} from '@/lib/redemptionCelebrationDiscovery';
import type { RedemptionPresentationInput } from '@/lib/redemptionPresentation';
import { alignItems } from '@/lib/rtl';

type ClaimedReceipt = {
  receiptToken: string;
  claimToken: string;
  confirmedAt: number;
  claimExpiresAt: number;
  presentation: RedemptionPresentationInput;
};

type ClaimPendingReceiptResult =
  | { status: 'none' }
  | ({ status: 'claimed' } & ClaimedReceipt);

type AcknowledgePresentationResult = {
  status: 'presented' | 'expired' | 'revoked';
};

type AuthorizeShareResult = {
  allowed: boolean;
  state: 'normal' | 'expired' | 'revoked' | 'unavailable';
};

class RedemptionCelebrationHostBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
      reason_code: 'host_render_failed',
      lifecycle_status: 'unavailable',
      occurred_at: Date.now(),
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RedemptionCelebrationHostContent() {
  const claimPendingReceipt = useMutation(
    api.redemptionReceipts.claimPendingRedemptionReceipt
  );
  const acknowledgePresentation = useMutation(
    api.redemptionReceipts.acknowledgeRedemptionPresentation
  );
  const authorizeShare = useMutation(
    api.redemptionReceipts.authorizeRedemptionReceiptShare
  );
  const [claimedReceipt, setClaimedReceipt] = useState<ClaimedReceipt | null>(
    null
  );
  const [claimRetryGeneration, setClaimRetryGeneration] = useState(0);
  const [acknowledgeRetryGeneration, setAcknowledgeRetryGeneration] =
    useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const claimInFlightRef = useRef(false);
  const acknowledgeInFlightRef = useRef(false);
  const consumedConfirmedAtRef = useRef<number | null>(null);
  const lastSignalConfirmedAtRef = useRef<number | null>(null);
  const retryUsedForSignalRef = useRef(false);
  const acknowledgedClaimRef = useRef<string | null>(null);
  const openClaimTokenRef = useRef<string | null>(null);
  const claimedReceiptRef = useRef<ClaimedReceipt | null>(null);
  const acknowledgeRetryUsedRef = useRef(false);
  const acknowledgeRetryTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const claimLeaseRecoveryTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const loggedBlockedConfirmedAtRef = useRef<number | null>(null);
  claimedReceiptRef.current = claimedReceipt;
  const pendingSignal = useQuery(
    api.redemptionReceipts.hasPendingRedemptionCelebration,
    { refreshGeneration: claimRetryGeneration }
  );
  const livePresentation = useQuery(
    api.redemptionReceipts.getRedemptionReceiptPresentation,
    claimedReceipt
      ? { receiptToken: claimedReceipt.receiptToken }
      : 'skip'
  );
  const presentation = livePresentation ?? claimedReceipt?.presentation;
  const pending = pendingSignal?.pending === true;
  const newestConfirmedAt = pendingSignal?.newestConfirmedAt;
  const claimAttemptKey =
    pending &&
    typeof newestConfirmedAt === 'number' &&
    Number.isFinite(newestConfirmedAt)
      ? `${newestConfirmedAt}:${claimRetryGeneration}`
      : null;

  useEffect(() => {
    if (!pending) {
      retryUsedForSignalRef.current = false;
      lastSignalConfirmedAtRef.current = null;
      loggedBlockedConfirmedAtRef.current = null;
      return;
    }
    const signalConfirmedAt = Number(newestConfirmedAt);
    if (lastSignalConfirmedAtRef.current !== signalConfirmedAt) {
      lastSignalConfirmedAtRef.current = signalConfirmedAt;
      retryUsedForSignalRef.current = false;
    }
    if (
      claimAttemptKey === null ||
      claimedReceipt ||
      claimInFlightRef.current ||
      !shouldClaimRedemptionCelebration(
        { pending, newestConfirmedAt },
        consumedConfirmedAtRef.current,
        appState
      )
    ) {
      if (
        pending &&
        !claimedReceipt &&
        !claimInFlightRef.current &&
        !isRedemptionCelebrationForeground(appState) &&
        Number.isFinite(newestConfirmedAt) &&
        loggedBlockedConfirmedAtRef.current !== Number(newestConfirmedAt)
      ) {
        loggedBlockedConfirmedAtRef.current = Number(newestConfirmedAt);
        track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
          reason_code: 'claim_blocked_not_foreground',
          lifecycle_status: 'available',
          occurred_at: Date.now(),
        });
      }
      return;
    }
    claimInFlightRef.current = true;
    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    void claimPendingReceipt({})
      .then((result) => {
        const claimed = result as ClaimPendingReceiptResult;
        if (claimed?.status === 'claimed') {
          setClaimedReceipt({
            receiptToken: claimed.receiptToken,
            claimToken: claimed.claimToken,
            confirmedAt: claimed.confirmedAt,
            claimExpiresAt: claimed.claimExpiresAt,
            presentation: claimed.presentation,
          });
          acknowledgeRetryUsedRef.current = false;
          track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
            reason_code: 'claim_succeeded',
            lifecycle_status: 'claimed',
            occurred_at: Date.now(),
          });
          return;
        }
        track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
          reason_code: 'claim_returned_none',
          lifecycle_status: 'available',
          occurred_at: Date.now(),
        });
        if (!disposed && !retryUsedForSignalRef.current) {
          retryUsedForSignalRef.current = true;
          retryTimeout = setTimeout(() => {
            setClaimRetryGeneration((generation) => generation + 1);
          }, 2_000);
        }
      })
      .catch(() => {
        track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
          reason_code: 'claim_failed',
          lifecycle_status: 'available',
          occurred_at: Date.now(),
        });
        if (!disposed && !retryUsedForSignalRef.current) {
          retryUsedForSignalRef.current = true;
          retryTimeout = setTimeout(() => {
            setClaimRetryGeneration((generation) => generation + 1);
          }, 2_000);
        }
        // One bounded retry plus a later foreground can recover discovery.
      })
      .finally(() => {
        claimInFlightRef.current = false;
      });
    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [
    appState,
    claimAttemptKey,
    claimPendingReceipt,
    claimedReceipt,
    newestConfirmedAt,
    pending,
  ]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (
        !isRedemptionCelebrationForeground(previousState) &&
        isRedemptionCelebrationForeground(nextState)
      ) {
        consumedConfirmedAtRef.current = null;
        lastSignalConfirmedAtRef.current = null;
        retryUsedForSignalRef.current = false;
        acknowledgeRetryUsedRef.current = false;
        const currentClaim = claimedReceiptRef.current;
        if (
          currentClaim &&
          currentClaim.claimExpiresAt <= Date.now()
        ) {
          openClaimTokenRef.current = null;
          setClaimedReceipt(null);
        }
        setClaimRetryGeneration((generation) => generation + 1);
        setAcknowledgeRetryGeneration((generation) => generation + 1);
        track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
          reason_code: 'foreground_refresh',
          lifecycle_status: currentClaim ? 'claimed' : 'available',
          occurred_at: Date.now(),
        });
      }
      previousState = nextState;
    });
    return () => {
      subscription.remove();
      if (acknowledgeRetryTimeoutRef.current) {
        clearTimeout(acknowledgeRetryTimeoutRef.current);
      }
      if (claimLeaseRecoveryTimeoutRef.current) {
        clearTimeout(claimLeaseRecoveryTimeoutRef.current);
      }
    };
  }, []);

  const handlePresentationVisible = useCallback(() => {
    if (
      !claimedReceipt ||
      presentation?.state !== 'normal' ||
      !isRedemptionCelebrationForeground(appState) ||
      acknowledgedClaimRef.current === claimedReceipt.claimToken ||
      acknowledgeInFlightRef.current
    ) {
      return;
    }
    acknowledgeInFlightRef.current = true;
    openClaimTokenRef.current = claimedReceipt.claimToken;
    void acknowledgePresentation({
      receiptToken: claimedReceipt.receiptToken,
      claimToken: claimedReceipt.claimToken,
    })
      .then((result) => {
        const acknowledgement = result as AcknowledgePresentationResult;
        if (
          acknowledgement?.status === 'presented' &&
          openClaimTokenRef.current === claimedReceipt.claimToken
        ) {
          acknowledgedClaimRef.current = claimedReceipt.claimToken;
          consumedConfirmedAtRef.current = rememberConsumedCelebration(
            consumedConfirmedAtRef.current,
            claimedReceipt.confirmedAt
          );
          playRedemptionCelebrationFeedback(claimedReceipt.claimToken);
        }
        track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
          reason_code: `acknowledge_${acknowledgement?.status ?? 'unknown'}`,
          lifecycle_status: acknowledgement?.status ?? 'unknown',
          occurred_at: Date.now(),
        });
      })
      .catch(() => {
        track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
          reason_code: 'acknowledge_failed',
          lifecycle_status: 'claimed',
          occurred_at: Date.now(),
        });
        if (
          openClaimTokenRef.current === claimedReceipt.claimToken &&
          !acknowledgeRetryUsedRef.current
        ) {
          acknowledgeRetryUsedRef.current = true;
          acknowledgeRetryTimeoutRef.current = setTimeout(() => {
            setAcknowledgeRetryGeneration((generation) => generation + 1);
            acknowledgeRetryTimeoutRef.current = null;
          }, 2_000);
        }
        // An unacknowledged lease becomes claimable again after a crash/failure.
      })
      .finally(() => {
        acknowledgeInFlightRef.current = false;
      });
  }, [
    acknowledgePresentation,
    appState,
    claimedReceipt,
    presentation?.state,
  ]);

  useEffect(() => {
    void acknowledgeRetryGeneration;
    if (claimedReceipt) {
      handlePresentationVisible();
    }
  }, [
    acknowledgeRetryGeneration,
    claimedReceipt,
    handlePresentationVisible,
  ]);

  const handleClose = useCallback(() => {
    openClaimTokenRef.current = null;
    if (acknowledgeRetryTimeoutRef.current) {
      clearTimeout(acknowledgeRetryTimeoutRef.current);
      acknowledgeRetryTimeoutRef.current = null;
    }
    const receipt = claimedReceipt;
    setClaimedReceipt(null);
    if (!receipt) {
      return;
    }
    if (acknowledgedClaimRef.current === receipt.claimToken) {
      consumedConfirmedAtRef.current = rememberConsumedCelebration(
        consumedConfirmedAtRef.current,
        receipt.confirmedAt
      );
      return;
    }
    if (
      presentation?.state === 'normal' &&
      !acknowledgeInFlightRef.current
    ) {
      acknowledgeInFlightRef.current = true;
      void acknowledgePresentation({
        receiptToken: receipt.receiptToken,
        claimToken: receipt.claimToken,
      })
        .then((result) => {
          const acknowledgement = result as AcknowledgePresentationResult;
          if (acknowledgement?.status === 'presented') {
            acknowledgedClaimRef.current = receipt.claimToken;
            consumedConfirmedAtRef.current = rememberConsumedCelebration(
              consumedConfirmedAtRef.current,
              receipt.confirmedAt
            );
          }
          track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
            reason_code: `dismiss_acknowledge_${acknowledgement?.status ?? 'unknown'}`,
            lifecycle_status: acknowledgement?.status ?? 'unknown',
            occurred_at: Date.now(),
          });
        })
        .catch(() => {
          track(ANALYTICS_EVENTS.redemptionCelebrationLifecycle, {
            reason_code: 'dismiss_acknowledge_failed',
            lifecycle_status: 'claimed',
            occurred_at: Date.now(),
          });
          const recoveryDelay = Math.max(
            0,
            receipt.claimExpiresAt - Date.now() + 100
          );
          if (claimLeaseRecoveryTimeoutRef.current) {
            clearTimeout(claimLeaseRecoveryTimeoutRef.current);
          }
          claimLeaseRecoveryTimeoutRef.current = setTimeout(() => {
            setClaimRetryGeneration((generation) => generation + 1);
            claimLeaseRecoveryTimeoutRef.current = null;
          }, recoveryDelay);
        })
        .finally(() => {
          acknowledgeInFlightRef.current = false;
        });
      return;
    }
    const recoveryDelay = Math.max(
      0,
      receipt.claimExpiresAt - Date.now() + 100
    );
    if (claimLeaseRecoveryTimeoutRef.current) {
      clearTimeout(claimLeaseRecoveryTimeoutRef.current);
    }
    claimLeaseRecoveryTimeoutRef.current = setTimeout(() => {
      setClaimRetryGeneration((generation) => generation + 1);
      claimLeaseRecoveryTimeoutRef.current = null;
    }, recoveryDelay);
  }, [acknowledgePresentation, claimedReceipt, presentation?.state]);

  const handleAuthorizeShare = useCallback(async () => {
    if (!claimedReceipt || presentation?.state !== 'normal') {
      return false;
    }
    try {
      const result = (await authorizeShare({
        receiptToken: claimedReceipt.receiptToken,
      })) as AuthorizeShareResult;
      return result.allowed === true;
    } catch {
      return false;
    }
  }, [authorizeShare, claimedReceipt, presentation?.state]);

  if (!claimedReceipt || !presentation) {
    return null;
  }

  return (
    <Modal
      visible={true}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגירת חגיגת המימוש"
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.closeButtonPressed : null,
            ]}
          >
            <Ionicons name="close" size={24} color="#172554" />
          </Pressable>
        </View>
        <RedemptionCelebration
          source={presentation}
          authorizeShare={handleAuthorizeShare}
          style={styles.celebration}
        />
      </SafeAreaView>
    </Modal>
  );
}

export default function RedemptionCelebrationHost() {
  return (
    <RedemptionCelebrationHostBoundary>
      <RedemptionCelebrationHostContent />
    </RedemptionCelebrationHostBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    alignItems: alignItems.start,
    justifyContent: 'center',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C9D8F5',
  },
  closeButtonPressed: {
    opacity: 0.76,
  },
  celebration: {
    flex: 1,
  },
});
