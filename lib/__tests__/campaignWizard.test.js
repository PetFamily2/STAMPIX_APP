import { describe, expect, test } from 'bun:test';
import {
  buildWizardCampaignDraft,
  wizardInitialCopy,
  wizardStepError,
} from '../campaigns/campaignWizard';

const draft = (type = 'promo') => ({
  type,
  days: '30',
  ...wizardInitialCopy(type),
});
describe('campaign wizard save boundary', () => {
  test('switching goals produces the corresponding server audience, never a customer-id target', () => {
    for (const [type, audience] of [
      ['promo', 'all_active_members'],
      ['winback', 'inactive_days'],
      ['welcome', 'new_customers'],
      ['birthday', 'birthday_today'],
      ['anniversary', 'anniversary_today'],
    ]) {
      const payload = buildWizardCampaignDraft(draft(type));
      expect(payload.rules.audience).toBe(audience);
      expect(payload).not.toHaveProperty('customerUserId');
      expect(payload).not.toHaveProperty('automationEnabled');
      expect(payload).not.toHaveProperty('status');
    }
  });
  test('final save validates every earlier step, including manipulated wizard state', () => {
    for (const changes of [
      { type: 'invalid' },
      { title: ' ' },
      { messageTitle: ' ' },
      { messageBody: 'x' },
      { messageBody: 'x'.repeat(401) },
      { type: 'winback', days: '0' },
      { type: 'welcome', days: '2.5' },
    ]) {
      expect(() =>
        buildWizardCampaignDraft({ ...draft(), ...changes })
      ).toThrow();
    }
  });
  test('does not force hidden day fields on date-based campaigns', () => {
    expect(wizardStepError(5, { ...draft('birthday'), days: '' })).toBeNull();
    expect(
      buildWizardCampaignDraft({ ...draft('winback'), days: '45' }).rules
    ).toEqual({ audience: 'inactive_days', daysInactive: 45 });
  });
});
