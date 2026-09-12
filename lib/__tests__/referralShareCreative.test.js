import { describe, expect, test } from 'bun:test';

import { buildReferralShareCreative } from '../referrals/shareCreative';

describe('referral share creative', () => {
  test('includes branding, public name, 12-month benefit and clickable URL', () => {
    const general = buildReferralShareCreative({
      businessPublicName: 'קפה ברק',
      code: 'abc123XYZ0',
      variant: 'general',
    });
    const story = buildReferralShareCreative({
      businessPublicName: 'קפה ברק',
      code: 'abc123XYZ0',
      variant: 'story',
    });
    expect(general.brand).toBe('StampAix');
    expect(general.businessPublicName).toBe('קפה ברק');
    expect(general.benefit).toContain('12 חודשי מנוי בתשלום');
    expect(general.url).toBe('https://stampaix.com/r/abc123XYZ0');
    expect(general.shareText).toContain(general.url);
    expect(general.shareText).not.toContain('30 ימים');
    expect(general.shareText).not.toContain('business_');
    expect(general.width).toBe(1080);
    expect(general.height).toBe(1350);
    expect(story.width).toBe(1080);
    expect(story.height).toBe(1920);
  });
});
