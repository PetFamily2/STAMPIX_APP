import {
  CANONICAL_ACCOUNT_DELETION_URL,
  CANONICAL_PRIVACY_URL,
  CANONICAL_TERMS_URL,
} from '@/lib/legalContract';

// Store builds must always open the canonical public contract. Environment
// overrides previously allowed a build to point at a non-canonical document.
export const PRIVACY_POLICY_URL = CANONICAL_PRIVACY_URL;
export const TERMS_OF_SERVICE_URL = CANONICAL_TERMS_URL;
export const ACCOUNT_DELETION_URL = CANONICAL_ACCOUNT_DELETION_URL;
