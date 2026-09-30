export const SUMIT_PAYMENT_ID_PARAM = 'og-paymentid' as const;
export const SUMIT_CHECKOUT_ID_PARAM = 'og-externalidentifier' as const;

type SearchValue = string | string[] | undefined;

function firstNonEmpty(value: SearchValue): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const normalized = first?.trim();
  return normalized ? normalized : null;
}

export function readSumitVerificationIdentifiers(
  params: Record<string, SearchValue>
): { checkoutId: string; paymentId: string } | null {
  const checkoutId = firstNonEmpty(params[SUMIT_CHECKOUT_ID_PARAM]);
  const paymentId = firstNonEmpty(params[SUMIT_PAYMENT_ID_PARAM]);
  return checkoutId && paymentId ? { checkoutId, paymentId } : null;
}

export function isVerifiedActiveSumitResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }
  const value = result as { ok?: unknown; subscriptionStatus?: unknown };
  return (
    value.ok === true &&
    (value.subscriptionStatus === 'active' ||
      value.subscriptionStatus === 'trialing')
  );
}
