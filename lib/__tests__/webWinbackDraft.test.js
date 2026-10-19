import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildWebWinbackDraft } from '../campaigns/webWinbackDraft';

describe('Web winback campaign preparation', () => {
  test('invitation uses the existing inactive-days audience and invents no discount', () => {
    const draft = buildWebWinbackDraft({
      days: '30',
      mode: 'invite',
      offer: '',
    });
    expect(draft.type).toBe('winback');
    expect(draft.rules).toEqual({
      audience: 'inactive_days',
      daysInactive: 30,
    });
    expect(draft.messageBody).toContain('נשמח לארח');
    expect(draft).not.toHaveProperty('automationEnabled');
    expect(draft).not.toHaveProperty('status');
    expect(draft).not.toHaveProperty('customerUserId');
  });
  test('an attractive offer requires explicit business-provided content', () => {
    expect(() =>
      buildWebWinbackDraft({ days: '45', mode: 'offer', offer: '' })
    ).toThrow();
    const draft = buildWebWinbackDraft({
      days: '45',
      mode: 'offer',
      offer: ' קפה קטן על חשבון הבית בביקור הבא ',
    });
    expect(draft.messageBody).toContain('קפה קטן על חשבון הבית');
    expect(draft.rules.daysInactive).toBe(45);
  });
  test('rejects unsafe or ambiguous inactivity values before any draft mutation', () => {
    for (const days of [
      '',
      ' ',
      '0',
      '-1',
      '2.5',
      '366',
      'Infinity',
      'abc',
      '0x1e',
      '1e2',
    ]) {
      expect(() =>
        buildWebWinbackDraft({ days, mode: 'invite', offer: '' })
      ).toThrow();
    }
  });
  test('customer CTA opens a scoped winback setup, not email as the primary action', () => {
    const details = readFileSync(
      'components/business-web/BusinessWebCustomerDetails.tsx',
      'utf8'
    );
    expect(details).toContain('label="הגדרת קמפיין החזרה"');
    expect(details).toContain("template: 'winback'");
    expect(details).toContain('businessId: String(businessId)');
    expect(details).not.toMatch(/useMutation|setCampaignAutomationEnabled/);
    const setup = readFileSync(
      'components/business-web/WebWinbackCampaignSetup.web.tsx',
      'utf8'
    );
    expect(setup).toContain('api.campaigns.createCampaignDraft');
    expect(setup).toContain('onSubmit=');
    expect(setup).toContain('scopeMatches');
    expect(setup).toContain('inFlight.current');
    expect(setup).not.toMatch(
      /setCampaignAutomationEnabled|sendCampaignNow|runAutomationSweep/
    );
    expect(setup).toContain('טיוטה בלבד');
  });
});
