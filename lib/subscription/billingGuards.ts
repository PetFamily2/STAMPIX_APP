export const SERVER_AUTHORITATIVE_BILLING_ENABLED = false;

export const BILLING_UNAVAILABLE_TITLE_HE = 'הרכישה אינה זמינה';

export const BILLING_UNAVAILABLE_MESSAGE_HE =
  'רכישות ומנויים בתשלום אינם זמינים כרגע. נחבר חיוב מאומת בשלב הבא, ובינתיים לא תחויבו.';

export function canStartRevenueCatPurchase() {
  return SERVER_AUTHORITATIVE_BILLING_ENABLED;
}
