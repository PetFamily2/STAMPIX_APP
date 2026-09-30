import { useAction, useConvexAuth } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  type SumitReturnState,
  SumitReturnSurface,
} from '@/components/business-web/SumitReturnSurface';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import {
  isVerifiedActiveSumitResult,
  readSumitVerificationIdentifiers,
} from '@/lib/billing/sumitWebReturn';
import { BUSINESS_WEB_ROUTES } from '@/lib/businessWebNavigation';

export default function SumitSuccessReturnScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const verifyPayment = useAction(api.sumitBilling.verifySUMITCheckoutPayment);
  const attemptedRef = useRef(false);
  const [state, setState] = useState<SumitReturnState>('verifying');

  const identifiers = readSumitVerificationIdentifiers(params);
  const checkoutId = identifiers?.checkoutId ?? null;
  const paymentId = identifiers?.paymentId ?? null;

  useEffect(() => {
    if (Platform.OS !== 'web' || !isAuthenticated || attemptedRef.current) {
      return;
    }
    attemptedRef.current = true;
    if (!checkoutId || !paymentId) {
      setState('awaiting_verification');
      return;
    }
    void verifyPayment({ checkoutId, paymentId })
      .then((result) => {
        if (isVerifiedActiveSumitResult(result)) {
          setState('verified');
        } else if (result.ok === true) {
          setState('pending');
        } else {
          setState('failed');
        }
      })
      .catch(() => setState('failed'));
  }, [checkoutId, isAuthenticated, paymentId, verifyPayment]);

  if (Platform.OS !== 'web') {
    return <Redirect href={BUSINESS_WEB_ROUTES.billing} />;
  }
  if (isLoading) {
    return <FullScreenLoading />;
  }
  if (!isAuthenticated) {
    return <SumitReturnSurface state="reauthentication" />;
  }
  return <SumitReturnSurface state={state} />;
}
