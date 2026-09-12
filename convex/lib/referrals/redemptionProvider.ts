export type RedemptionProviderKind = 'google' | 'apple';

export type RedemptionPrepareResult =
  | {
      canRedeem: true;
      provider: 'google';
      mode: 'defer';
      months: number;
    }
  | {
      canRedeem: true;
      provider: 'apple';
      mode: 'promotional_offer';
      months: number;
      offerIdentifier: string;
    }
  | {
      canRedeem: false;
      provider: RedemptionProviderKind;
      code: string;
      message: string;
    };

export type ReferralRewardRedemptionProvider = {
  kind: RedemptionProviderKind;
  canRedeem(args: {
    months: number;
    hasActivePaidSubscription: boolean;
    storeProductId?: string | null;
  }): RedemptionPrepareResult;
  apply(args: {
    months: number;
    providerAppUserId: string;
    productId?: string | null;
    idempotencyKey: string;
  }): Promise<{
    ok: boolean;
    monthsConfirmed?: number;
    newPeriodEndAt?: number;
    failureCode?: string;
    requestFingerprint: string;
  }>;
};

function googleSubscriptionId(productId?: string | null): string | null {
  if (!productId) {
    return null;
  }
  return productId.split(':')[0] ?? null;
}

export function createGoogleRedemptionProvider(options?: {
  secretApiKey?: string | null;
  fetchImpl?: typeof fetch;
}): ReferralRewardRedemptionProvider {
  return {
    kind: 'google',
    canRedeem(args) {
      if (!args.hasActivePaidSubscription) {
        return {
          canRedeem: false,
          provider: 'google',
          code: 'SUBSCRIPTION_INACTIVE',
          message: 'אין מנוי פעיל למימוש',
        };
      }
      if (!options?.secretApiKey) {
        return {
          canRedeem: false,
          provider: 'google',
          code: 'PROVIDER_CREDENTIALS_MISSING',
          message: 'מימוש Google דורש הגדרת קונסול',
        };
      }
      return {
        canRedeem: true,
        provider: 'google',
        mode: 'defer',
        months: args.months,
      };
    },
    async apply(args) {
      const requestFingerprint = `google-defer:${args.idempotencyKey}:${args.months}`;
      if (!options?.secretApiKey) {
        return {
          ok: false,
          failureCode: 'PROVIDER_CREDENTIALS_MISSING',
          requestFingerprint,
        };
      }
      const subscriptionId = googleSubscriptionId(args.productId);
      if (!subscriptionId) {
        return {
          ok: false,
          failureCode: 'MISSING_SUBSCRIPTION_ID',
          requestFingerprint,
        };
      }
      const fetchImpl = options.fetchImpl ?? fetch;
      const extendByDays = args.months * 30;
      const response = await fetchImpl(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(
          args.providerAppUserId
        )}/subscriptions/${encodeURIComponent(subscriptionId)}/defer`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.secretApiKey}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': args.idempotencyKey,
          },
          body: JSON.stringify({ extend_by_days: extendByDays }),
        }
      );
      if (!response.ok) {
        return {
          ok: false,
          failureCode: `GOOGLE_DEFER_${response.status}`,
          requestFingerprint,
        };
      }
      const payload = (await response.json().catch(() => ({}))) as {
        expiry_time_ms?: number;
      };
      return {
        ok: true,
        monthsConfirmed: args.months,
        newPeriodEndAt: payload.expiry_time_ms,
        requestFingerprint,
      };
    },
  };
}

export function createAppleRedemptionProvider(options?: {
  promotionalOfferByMonths?: Record<number, string>;
}): ReferralRewardRedemptionProvider {
  const offers = options?.promotionalOfferByMonths ?? {
    1: process.env.REVENUECAT_APPLE_PROMO_OFFER_1_MONTH ?? '',
    2: process.env.REVENUECAT_APPLE_PROMO_OFFER_2_MONTH ?? '',
  };
  return {
    kind: 'apple',
    canRedeem(args) {
      if (!args.hasActivePaidSubscription) {
        return {
          canRedeem: false,
          provider: 'apple',
          code: 'SUBSCRIPTION_INACTIVE',
          message: 'אין מנוי פעיל למימוש',
        };
      }
      const offerIdentifier = offers[args.months];
      if (!offerIdentifier) {
        return {
          canRedeem: false,
          provider: 'apple',
          code: 'PROMO_OFFER_UNCONFIGURED',
          message: 'מימוש Apple דורש הגדרת הטבת מנוי בקונסול',
        };
      }
      return {
        canRedeem: true,
        provider: 'apple',
        mode: 'promotional_offer',
        months: args.months,
        offerIdentifier,
      };
    },
    async apply(args) {
      const requestFingerprint = `apple-promo:${args.idempotencyKey}:${args.months}`;
      const offerIdentifier = offers[args.months];
      if (!offerIdentifier) {
        return {
          ok: false,
          failureCode: 'PROMO_OFFER_UNCONFIGURED',
          requestFingerprint,
        };
      }
      return {
        ok: false,
        failureCode: 'AWAITING_STOREKIT_CONFIRMATION',
        requestFingerprint,
      };
    },
  };
}

export function selectRedemptionProvider(
  store: 'google' | 'apple' | 'unknown',
  options?: {
    googleSecretApiKey?: string | null;
  }
): ReferralRewardRedemptionProvider {
  if (store === 'apple') {
    return createAppleRedemptionProvider();
  }
  return createGoogleRedemptionProvider({
    secretApiKey: options?.googleSecretApiKey,
  });
}
