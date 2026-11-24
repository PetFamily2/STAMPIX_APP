export const SUMIT_PAYMENT_ID_PARAM = 'og-paymentid' as const;
export const SUMIT_CHECKOUT_ID_PARAM = 'og-externalidentifier' as const;

type SearchValue = string | string[] | undefined;

const PENDING_CHECKOUT_KEY = 'stampaix:sumit:pending-checkout';

function readUniqueValue(
  params: Record<string, SearchValue>,
  name: string
): string | null {
  const values = new Set<string>();
  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase() === name) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        const normalized = entry?.trim();
        if (normalized) values.add(normalized);
      }
    }
  }
  return values.size === 1 ? (values.values().next().value ?? null) : null;
}

export function rememberPendingSumitCheckout(checkoutId: string): void {
  try {
    window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, checkoutId);
  } catch {
    // Server recovery also runs if storage is unavailable.
  }
}

export function readPendingSumitCheckout(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
  } catch {
    return null;
  }
}

export function forgetPendingSumitCheckout(checkoutId: string): void {
  try {
    if (readPendingSumitCheckout() === checkoutId) {
      window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    }
  } catch {
    // The server remains authoritative if browser storage is unavailable.
  }
}

export function readSumitVerificationIdentifiers(
  params: Record<string, SearchValue>
): { checkoutId: string | null; paymentId: string | null } | null {
  const checkoutId = readUniqueValue(params, SUMIT_CHECKOUT_ID_PARAM);
  const paymentId = readUniqueValue(params, SUMIT_PAYMENT_ID_PARAM);
  return checkoutId || paymentId ? { checkoutId, paymentId } : null;
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
