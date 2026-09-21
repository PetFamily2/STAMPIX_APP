export const CANONICAL_PRIVACY_URL =
  'https://stampaix.com/legal/privacy' as const;
export const CANONICAL_TERMS_URL = 'https://stampaix.com/legal/terms' as const;
export const CANONICAL_ACCOUNT_DELETION_URL =
  'https://stampaix.com/account-deletion' as const;

// Immutable evidence identifiers for the current canonical website text.
// Update these only when the corresponding public contract changes.
export const CANONICAL_LEGAL_VERSION = '2026.09.21' as const;
export const CANONICAL_LEGAL_UPDATED_AT = '21.09.2026' as const;
export const CANONICAL_PRIVACY_VERSION = CANONICAL_LEGAL_VERSION;
export const CANONICAL_TERMS_VERSION = CANONICAL_LEGAL_VERSION;
export const BUSINESS_TERMS_VERSION = CANONICAL_LEGAL_VERSION;
export const MARKETING_CONSENT_VERSION = 'account-wide-in-app-push-v1' as const;

export const MARKETING_CONSENT_CHANNELS = ['in_app', 'push'] as const;
export const MARKETING_CONSENT_SCOPE =
  'stampaix_and_joined_businesses' as const;
