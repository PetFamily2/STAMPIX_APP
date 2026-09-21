import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  ACCOUNT_DELETION_URL,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from '../../config/legalUrls';
import {
  BUSINESS_TERMS_VERSION,
  CANONICAL_ACCOUNT_DELETION_URL,
  CANONICAL_LEGAL_UPDATED_AT,
  CANONICAL_LEGAL_VERSION,
  CANONICAL_PRIVACY_URL,
  CANONICAL_PRIVACY_VERSION,
  CANONICAL_TERMS_URL,
  CANONICAL_TERMS_VERSION,
  MARKETING_CONSENT_CHANNELS,
  MARKETING_CONSENT_SCOPE,
} from '../legalContract';
import { LEGAL_DOCUMENTS } from '../legalDocuments';
import { MOBILE_LEGAL_DOCUMENTS } from '../mobileLegalDocuments';

const readSource = (path) => readFileSync(path, { encoding: 'utf8' });

describe('canonical legal contract sync', () => {
  test('website URLs and version identifiers match 2026.09.21', () => {
    expect(CANONICAL_PRIVACY_URL).toBe('https://stampaix.com/legal/privacy');
    expect(CANONICAL_TERMS_URL).toBe('https://stampaix.com/legal/terms');
    expect(CANONICAL_ACCOUNT_DELETION_URL).toBe(
      'https://stampaix.com/account-deletion'
    );
    expect(PRIVACY_POLICY_URL).toBe(CANONICAL_PRIVACY_URL);
    expect(TERMS_OF_SERVICE_URL).toBe(CANONICAL_TERMS_URL);
    expect(ACCOUNT_DELETION_URL).toBe(CANONICAL_ACCOUNT_DELETION_URL);
    expect(CANONICAL_LEGAL_VERSION).toBe('2026.09.21');
    expect(CANONICAL_LEGAL_UPDATED_AT).toBe('21.09.2026');
    expect(CANONICAL_PRIVACY_VERSION).toBe(CANONICAL_LEGAL_VERSION);
    expect(CANONICAL_TERMS_VERSION).toBe(CANONICAL_LEGAL_VERSION);
    expect(BUSINESS_TERMS_VERSION).toBe(CANONICAL_LEGAL_VERSION);
    expect(MARKETING_CONSENT_SCOPE).toBe('stampaix_and_joined_businesses');
    expect([...MARKETING_CONSENT_CHANNELS]).toEqual(['in_app', 'push']);
  });

  test('public and mobile legal copies use 21.09.2026 and do not keep 20.06.2026', () => {
    for (const document of [
      ...Object.values(LEGAL_DOCUMENTS),
      ...Object.values(MOBILE_LEGAL_DOCUMENTS),
    ]) {
      expect(document.updatedAt).toBe('21.09.2026');
    }

    for (const path of [
      'lib/legalDocuments.ts',
      'lib/mobileLegalDocuments.ts',
      'lib/legalContract.ts',
      'convex/http.ts',
    ]) {
      expect(readSource(path)).not.toContain('20.06.2026');
    }
  });

  test('nearby businesses request approximate location only', () => {
    const locationHook = readSource('hooks/useCurrentLocation.ts');
    expect(locationHook).toContain('Location.Accuracy.Low');
    expect(locationHook).not.toContain('Location.Accuracy.Balanced');
    expect(locationHook).not.toContain('Location.Accuracy.High');
    expect(locationHook).not.toContain('Location.Accuracy.BestForNavigation');
    expect(locationHook).toContain('requestForegroundPermissionsAsync');
    expect(locationHook).not.toContain('requestBackgroundPermissionsAsync');
  });

  test('WhatsApp remains optional and does not render a phone number', () => {
    const supportContact = readSource('lib/help/supportContact.ts');
    const whatsappButton = readSource(
      'components/help/SupportWhatsAppButton.tsx'
    );
    expect(supportContact).toContain('clickToChatNumber');
    expect(supportContact).not.toContain('displayPhone');
    expect(whatsappButton).not.toContain('055');
    expect(whatsappButton).not.toContain('972');
  });
});
