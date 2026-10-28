import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  webCustomerGuidance,
  webCustomerStateLabel,
} from '../customers/webCustomerGuidance';

describe('Web customer details and next-step guidance', () => {
  test('uses plain-language labels with a safe unknown-state fallback', () => {
    expect(webCustomerStateLabel('NEEDS_WINBACK')).toBe('לא ביקר לאחרונה');
    expect(webCustomerStateLabel('NEEDS_NURTURE')).toBe('כדאי לחזק קשר');
    for (const state of [
      undefined,
      null,
      '',
      'unknown',
      'toString',
      '__proto__',
    ]) {
      expect(webCustomerStateLabel(state)).toBe('ללא סיווג');
    }
  });

  test('explains winback and offers a real review step rather than an automatic send', () => {
    const guidance = webCustomerGuidance({
      customerState: 'NEEDS_WINBACK',
      marketingOptIn: true,
      phone: '+972 (50) 123-4567',
    });
    expect(guidance.explanation).toContain('לא תקלה בכרטיס');
    expect(guidance.nextStep).toContain('הביקור האחרון');
    expect(guidance.nextStep).toContain('בכרטיסיות למטה');
    expect(guidance.contact).toEqual({
      kind: 'phone',
      href: 'tel:+972501234567',
    });
  });

  test('does not offer marketing outreach to an opted-out customer', () => {
    expect(
      webCustomerGuidance({
        customerState: 'NEEDS_WINBACK',
        marketingOptIn: false,
        phone: '0501234567',
        email: 'customer@example.com',
      }).contact
    ).toBeNull();
  });

  test('does not invent a contact method or interpret elapsed days locally', () => {
    expect(
      webCustomerGuidance({
        customerState: 'NEEDS_WINBACK',
        marketingOptIn: true,
        phone: '123',
        email: 'invalid',
      }).contact
    ).toBeNull();
    expect(
      webCustomerGuidance({
        customerState: 'ACTIVE',
        marketingOptIn: true,
        phone: '0501234567',
      }).contact
    ).toBeNull();
    const source = readFileSync('lib/customers/webCustomerGuidance.ts', 'utf8');
    expect(source).not.toMatch(/Date\.now|lastVisitDaysAgo|winbackDays/);
  });

  test('every state has an explanation and a concrete next step', () => {
    for (const customerState of [
      'NEW',
      'ACTIVE',
      'NEEDS_NURTURE',
      'CLOSE_TO_REWARD',
      null,
    ]) {
      const guidance = webCustomerGuidance({
        customerState,
        marketingOptIn: false,
      });
      expect(guidance.explanation.length).toBeGreaterThan(10);
      expect(guidance.nextStep.length).toBeGreaterThan(10);
      expect(guidance.contact).toBeNull();
    }
  });

  test('the entire result row opens details and preserves search state on close', () => {
    const source = readFileSync(
      'components/business-web/BusinessWebCustomers.tsx',
      'utf8'
    );
    expect(source).toContain(
      'onPress={() => setSelectedCustomerId(customer.customerId)}'
    );
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('onClose={() => setSelectedCustomerId(null)}');
    expect(source).toContain(
      "customerUserId={selectedCustomerId as Id<'users'>}"
    );
    expect(source).toContain(
      'key={`${String(activeBusinessId)}-${selectedCustomerId}`}'
    );
    expect(source).not.toContain("setSearch('');");
  });

  test('details use only the existing business-scoped read query and handle failure states', () => {
    const source = readFileSync(
      'components/business-web/BusinessWebCustomerDetails.tsx',
      'utf8'
    );
    expect(source).toContain('api.customerCards.getBusinessCustomerCard');
    expect(source).toMatch(/businessId,\s*customerUserId,\s*limit: 30/);
    expect(source).toContain('card === undefined');
    expect(source).toContain('card === null');
    expect(source).toContain('DetailsErrorBoundary');
    expect(source).toContain('onRequestClose={props.onClose}');
    expect(source).toContain('card.programs.map');
    expect(source).toContain('card.timeline.map');
    expect(source).not.toMatch(
      /useMutation|useAction|api\.[^.]+\.(send|redeem|reverse|addStamp)/
    );
    expect(source).toContain('לא נשלחת הודעה');
  });
});
