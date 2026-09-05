import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RedemptionCelebration from '@/components/customer/RedemptionCelebration';
import { playRedemptionCelebrationFeedback } from '@/lib/feedback';
import {
  rememberConsumedCelebration,
  shouldClaimRedemptionCelebration,
  type RedemptionCelebrationAvailability,
} from '@/lib/redemptionCelebrationDiscovery';
import type { RedemptionPresentationInput } from '@/lib/redemptionPresentation';
import { alignItems } from '@/lib/rtl';

type ClaimedReceipt = {
  receiptToken: string;
  claimToken: string;
  confirmedAt: number;
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

const redemptionReceiptsApi = {
  hasPendingRedemptionCelebration: makeFunctionReference<
    'query',
    Record<string, never>,
    RedemptionCelebrationAvailability
  >('redemptionReceipts:hasPendingRedemptionCelebration'),
  claimPendingRedemptionReceipt: makeFunctionReference<
    'mutation',
    Record<string, never>,
    ClaimPendingReceiptResult
  >('redemptionReceipts:claimPendingRedemptionReceipt'),
  acknowledgeRedemptionPresentation: makeFunctionReference<
    'mutation',
    { receiptToken: string; claimToken: string },
    AcknowledgePresentationResult
  >('redemptionReceipts:acknowledgeRedemptionPresentation'),
  getRedemptionReceiptPresentation: makeFunctionReference<
    'query',
    { receiptToken: string },
    RedemptionPresentationInput
  >('redemptionReceipts:getRedemptionReceiptPresentation'),
  authorizeRedemptionReceiptShare: makeFunctionReference<
    'mutation',
    { receiptToken: string },
    AuthorizeShareResult
  >('redemptionReceipts:authorizeRedemptionReceiptShare'),
} as const;

export default function RedemptionCelebrationHost() {
  const claimPendingReceipt = useMutation(
    redemptionReceiptsApi.claimPendingRedemptionReceipt
  );
  const acknowledgePresentation = useMutation(
    redemptionReceiptsApi.acknowledgeRedemptionPresentation
  );
  const authorizeShare = useMutation(
    redemptionReceiptsApi.authorizeRedemptionReceiptShare
  );
  const [claimedReceipt, setClaimedReceipt] = useState<ClaimedReceipt | null>(
    null
  );
  const [claimRetryGeneration, setClaimRetryGeneration] = useState(0);
  const claimInFlightRef = useRef(false);
  const consumedConfirmedAtRef = useRef<number | null>(null);
  const lastSignalConfirmedAtRef = useRef<number | null>(null);
  const retryUsedForSignalRef = useRef(false);
  const acknowledgedClaimRef = useRef<string | null>(null);
  const openClaimTokenRef = useRef<string | null>(null);
  const pendingSignal = useQuery(
    redemptionReceiptsApi.hasPendingRedemptionCelebration,
    {}
  );
  const livePresentation = useQuery(
    redemptionReceiptsApi.getRedemptionReceiptPresentation,
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
        consumedConfirmedAtRef.current
      )
    ) {
      return;
    }
    claimInFlightRef.current = true;
    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    void claimPendingReceipt({})
      .then((result) => {
        if (result?.status === 'claimed') {
          setClaimedReceipt({
            receiptToken: result.receiptToken,
            claimToken: result.claimToken,
            confirmedAt: result.confirmedAt,
            presentation: result.presentation,
          });
        }
      })
      .catch(() => {
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
    claimAttemptKey,
    claimPendingReceipt,
    claimedReceipt,
    newestConfirmedAt,
    pending,
  ]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') {
        consumedConfirmedAtRef.current = null;
        lastSignalConfirmedAtRef.current = null;
        retryUsedForSignalRef.current = false;
        setClaimRetryGeneration((generation) => generation + 1);
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, []);

  const handleModalShown = useCallback(() => {
    if (
      !claimedReceipt ||
      presentation?.state !== 'normal' ||
      acknowledgedClaimRef.current === claimedReceipt.claimToken
    ) {
      return;
    }
    acknowledgedClaimRef.current = claimedReceipt.claimToken;
    openClaimTokenRef.current = claimedReceipt.claimToken;
    void acknowledgePresentation({
      receiptToken: claimedReceipt.receiptToken,
      claimToken: claimedReceipt.claimToken,
    })
      .then((result) => {
        if (
          result?.status === 'presented' &&
          openClaimTokenRef.current === claimedReceipt.claimToken
        ) {
          consumedConfirmedAtRef.current = rememberConsumedCelebration(
            consumedConfirmedAtRef.current,
            claimedReceipt.confirmedAt
          );
          playRedemptionCelebrationFeedback(claimedReceipt.claimToken);
        }
      })
      .catch(() => {
        // An unacknowledged lease becomes claimable again after a crash/failure.
      });
  }, [acknowledgePresentation, claimedReceipt, presentation?.state]);

  const handleClose = useCallback(() => {
    openClaimTokenRef.current = null;
    if (claimedReceipt) {
      consumedConfirmedAtRef.current = rememberConsumedCelebration(
        consumedConfirmedAtRef.current,
        claimedReceipt.confirmedAt
      );
    }
    setClaimedReceipt(null);
  }, [claimedReceipt]);

  const handleAuthorizeShare = useCallback(async () => {
    if (!claimedReceipt || presentation?.state !== 'normal') {
      return false;
    }
    try {
      const result = (await authorizeShare({
        receiptToken: claimedReceipt.receiptToken,
      })) as { allowed?: boolean };
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
      animationType="fade"
      presentationStyle="fullScreen"
      visible={true}
      onShow={handleModalShown}
      onRequestClose={handleClose}
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
