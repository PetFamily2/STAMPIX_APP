import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('web referral tabs gate their independent data subscriptions', () => {
  const source = readFileSync(
    'app/(authenticated)/(business)/settings-business-referrals.tsx',
    'utf8'
  );
  for (const [query, tab] of [
    ['getBusinessReferralPerformance', 'performance'],
    ['listBusinessReferralCustomers', 'customers'],
    ['listBusinessReferralRewards', 'rewards'],
  ]) {
    const start = source.indexOf(`api.referrals.${query}`);
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, start + 300)).toContain(
      `activeTab === '${tab}'`
    );
    expect(source.slice(start, start + 300)).toContain("'skip'");
  }
});
