import { isValidLoyaltyTarget } from '../loyalty/targetValidity';

export type WalletPreviewRedeemableInput = {
  previewProgramLifecycle: 'active' | 'archived';
  previewCurrentStamps: number | null;
  previewMaxStamps: number | null;
  previewCardRoute: string | null;
};

/**
 * The wallet row shows one preview membership. The redemption CTA belongs to
 * that visible card, never to a business-level redeemable count.
 */
export function isVisibleWalletPreviewRedeemable(
  preview: WalletPreviewRedeemableInput
): boolean {
  if (preview.previewProgramLifecycle !== 'active') {
    return false;
  }
  if (!preview.previewCardRoute) {
    return false;
  }
  const maxStamps = preview.previewMaxStamps;
  const currentStamps = preview.previewCurrentStamps;
  if (typeof maxStamps !== 'number' || typeof currentStamps !== 'number') {
    return false;
  }
  if (!isValidLoyaltyTarget(maxStamps) || !Number.isFinite(currentStamps)) {
    return false;
  }
  return Math.floor(currentStamps) >= Math.floor(maxStamps);
}

export function hasUsableCustomerScanToken(input: {
  scanTokenPayload: string | null;
  tokenExpiresAt: number | null;
  now: number;
}): boolean {
  return (
    Boolean(input.scanTokenPayload) &&
    typeof input.tokenExpiresAt === 'number' &&
    input.now < input.tokenExpiresAt
  );
}

/**
 * Reveal scrolls the QR that is already on the card screen.
 * A token request happens only when that QR has nothing usable to show.
 */
export function shouldRefreshScanTokenForReveal(input: {
  scanTokenPayload: string | null;
  tokenExpiresAt: number | null;
  isTokenLoading: boolean;
  now: number;
}): boolean {
  if (input.isTokenLoading) {
    return false;
  }
  return !hasUsableCustomerScanToken(input);
}
