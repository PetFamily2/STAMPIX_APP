import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { completeWebBusinessInvite } from '../referrals/webBusinessInvite';

function inviteFixture() {
  let current = true;
  const calls = [];
  const input = {
    isCurrent: () => current,
    mode: 'invite',
    createLink: async () => ({
      code: 'fixture',
      url: 'https://example.invalid/invite',
    }),
    creative: () => ({
      shareText: 'Invitation',
      url: 'https://example.invalid/invite',
    }),
    openWhatsApp: async () => {
      calls.push('whatsapp');
    },
    share: async () => {
      calls.push('share');
      return false;
    },
    copy: async () => {
      calls.push('copy');
      return true;
    },
  };
  return {
    input,
    calls,
    switchBusiness: () => {
      current = false;
    },
  };
}

test('a late invitation response cannot share another business link', async () => {
  const f = inviteFixture();
  let resolve;
  f.input.createLink = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = completeWebBusinessInvite(f.input);
  f.switchBusiness();
  resolve({ code: 'old-business', url: 'https://example.invalid/old' });
  expect(await pending).toBe('stale');
  expect(f.calls).toEqual([]);
});

test('switching while the share dialog is open prevents clipboard fallback', async () => {
  const f = inviteFixture();
  f.input.share = async () => {
    f.switchBusiness();
    return false;
  };
  expect(await completeWebBusinessInvite(f.input)).toBe('stale');
  expect(f.calls).toEqual([]);
});

test('clipboard fallback reports success only after an actual copy', async () => {
  const f = inviteFixture();
  expect(await completeWebBusinessInvite(f.input)).toBe('copied');
  expect(f.calls).toEqual(['share', 'copy']);
  f.input.copy = async () => false;
  expect(await completeWebBusinessInvite(f.input)).toBe('shown');
});

test('shared or dismissed browser dialog never triggers another share channel', async () => {
  const f = inviteFixture();
  f.input.share = async () => true;
  expect(await completeWebBusinessInvite(f.input)).toBe('shared');
  expect(f.calls).toEqual([]);
});

test('WhatsApp is a user-selected channel and never also copies the link', async () => {
  const f = inviteFixture();
  f.input.mode = 'whatsapp';
  expect(await completeWebBusinessInvite(f.input)).toBe('shared');
  expect(f.calls).toEqual(['whatsapp']);
});

test('Web adaptation leaves Native and protected game-shared source byte identical', () => {
  const base = '4cb0737796bbb663c747bca66e0682179034ff20';
  for (const file of [
    'app/(authenticated)/(business)/cards/[programId].tsx',
    'app/(authenticated)/(business)/dashboard.tsx',
    'app/(authenticated)/(business)/settings-business-invite-businesses.tsx',
    'app/(authenticated)/(business)/settings-business-referrals.tsx',
    'components/loyalty/ClassicStampGlyph.tsx',
    'components/loyalty/LoyaltyThemePalette.tsx',
    'components/loyalty/StampIconPicker.tsx',
    'components/loyalty/StampShapePicker.tsx',
    'components/loyalty/VisualSelectionTile.tsx',
    'components/management/EditorPrimitives.tsx',
    'components/management/ManagementPageHeader.tsx',
    'components/pwa-ui/PwaButton.tsx',
    'components/referrals/ReferralEmptyState.tsx',
    'app/(authenticated)/(customer)/wallet.web.tsx',
    'app/(authenticated)/(customer)/_layout.web.tsx',
    'convex/memberships.ts',
  ]) {
    const prior = execFileSync('git', ['show', `${base}:${file}`]);
    expect(readFileSync(file).equals(prior)).toBe(true);
  }
});

test('merged navigation preserves customer referral settings and Web billing safeguards', () => {
  const read = (file) => readFileSync(file, 'utf8');
  const billing = read('components/business-web/BusinessWebBilling.tsx');
  expect(billing).toContain('await onBeforeCheckout?.()');
  expect(billing).toContain('version: WEB_LEGAL_VERSION');
  expect(billing).toContain('WEB_LEGAL_DOCUMENTS.terms.sections');
  expect(billing).toContain('checkedBusinessId === activeBusinessId');
  expect(read('components/business-web/BusinessWebCampaigns.tsx')).toContain(
    '/business/customer-referrals'
  );
  expect(
    read('app/(web-business)/business/customer-referrals.web.tsx')
  ).toContain('webPresentation={true}');
  const referrals = read('components/business-web/BusinessWebReferrals.tsx');
  expect(referrals).not.toContain(
    'api.businessReferralEngine.prepareReferralRewardRedemption'
  );
  expect(referrals).not.toContain("store: 'google'");
  expect(referrals).toContain('WEB_BUSINESS_OPERATOR.supportEmail');
});
