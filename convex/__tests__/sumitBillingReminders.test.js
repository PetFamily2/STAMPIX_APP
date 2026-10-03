import { describe, expect, test } from 'bun:test';
import {
  BILLING_REMINDER_MAX_ATTEMPTS,
  billingReminderDedupeKey,
  buildBillingReminderEmail,
  resolveBillingReminderStage,
} from '../lib/billing/sumit/reminders';
import { DIRECT_PROVIDER_RENEWAL_GRACE_MS } from '../lib/billing/productionContract';

const DAY = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 9, 1, 9, 0, 0);
const graceEnd = start + DIRECT_PROVIDER_RENEWAL_GRACE_MS;

describe('SUMIT billing reminders', () => {
  test('selects only the latest due D0/D3/D6 stage', () => {
    expect(
      resolveBillingReminderStage({ gracePeriodEndAt: graceEnd, now: start })
    ).toBe(0);
    expect(
      resolveBillingReminderStage({
        gracePeriodEndAt: graceEnd,
        now: start + 4 * DAY,
      })
    ).toBe(3);
    expect(
      resolveBillingReminderStage({
        gracePeriodEndAt: graceEnd,
        now: start + 6 * DAY,
      })
    ).toBe(6);
  });

  test('does not send before grace, after grace, or duplicate a stage', () => {
    expect(
      resolveBillingReminderStage({
        gracePeriodEndAt: graceEnd,
        now: start - 1,
      })
    ).toBeNull();
    expect(
      resolveBillingReminderStage({
        gracePeriodEndAt: graceEnd,
        now: graceEnd,
      })
    ).toBeNull();
    expect(
      resolveBillingReminderStage({
        gracePeriodEndAt: graceEnd,
        now: start + 3 * DAY,
        sentStages: [3],
      })
    ).toBeNull();
  });

  test('uses a grace-cycle scoped dedupe key', () => {
    expect(
      billingReminderDedupeKey({
        businessId: 'biz_1',
        gracePeriodEndAt: graceEnd,
        stageDay: 3,
      })
    ).toBe(`sumit_payment_failure:biz_1:${graceEnd}:d3`);
  });

  test('escapes business names in email HTML', () => {
    const email = buildBillingReminderEmail({
      businessName: '<script>alert(1)</script>',
      stageDay: 6,
      gracePeriodEndAt: graceEnd,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.subject).toContain('StampAix');
    expect(BILLING_REMINDER_MAX_ATTEMPTS).toBe(3);
  });
});
