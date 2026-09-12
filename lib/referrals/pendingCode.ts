import * as SecureStore from 'expo-secure-store';

const PENDING_REFERRAL_CODE_KEY = 'stampaix.pending_business_referral_code';

export async function persistPendingReferralCode(code: string) {
  const normalized = code.trim();
  if (!normalized) {
    return;
  }
  await SecureStore.setItemAsync(PENDING_REFERRAL_CODE_KEY, normalized);
}

export async function readPendingReferralCode() {
  return (await SecureStore.getItemAsync(PENDING_REFERRAL_CODE_KEY)) ?? '';
}

export async function clearPendingReferralCode() {
  await SecureStore.deleteItemAsync(PENDING_REFERRAL_CODE_KEY);
}
