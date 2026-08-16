import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const SETTINGS_SCREEN = 'screens/BusinessSettingsScreen.tsx';
const RECOVERY_ROUTE = 'app/(authenticated)/business-recovery.tsx';
const AUTHENTICATED_LAYOUT = 'app/(authenticated)/_layout.tsx';
const BUSINESS_MODE_CTA = 'components/customer/BusinessModeCtaCard.tsx';
const MEMBERSHIPS_BACKEND = 'convex/memberships.ts';
const RECOVERY_PATH = '/(authenticated)/business-recovery';

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('business closure and recovery UX', () => {
  test('Business Settings exposes owner-only closure without changing leave-business behavior', () => {
    const source = readSource(SETTINGS_SCREEN);

    expect(source).toContain("activeBusiness?.staffRole === 'owner'");
    expect(source).toContain('סגירת העסק ב-StampAix');
    expect(source).toContain('פעילות העסק תופסק והכרטיסיות יוסתרו מהלקוחות');
    expect(source).toContain("api.business.closeBusinessAccount");
    expect(source).toContain("'סגירת העסק?'");
    expect(source).toContain("text: 'סגור את העסק'");
    expect(source).toContain("style: 'destructive'");
    expect(source).toContain('isClosingBusiness');
    expect(source).toContain('handleLeaveBusiness');
    expect(source).toContain('עזוב את העסק');
    expect(source).not.toContain('deleteMyAccountHard');
  });

  test('successful closure switches local mode before replacing to Customer wallet', () => {
    const source = readSource(SETTINGS_SCREEN);
    const mutationIndex = source.indexOf(
      'await closeBusinessAccount({ businessId: activeBusinessId })'
    );
    const localModeIndex = source.indexOf(
      "await setAppMode('customer')",
      mutationIndex
    );
    const walletIndex = source.indexOf(
      "router.replace('/(authenticated)/(customer)/wallet')",
      localModeIndex
    );

    expect(mutationIndex).toBeGreaterThan(-1);
    expect(localModeIndex).toBeGreaterThan(mutationIndex);
    expect(walletIndex).toBeGreaterThan(localModeIndex);
  });

  test('canonical authenticated recovery route lists closed businesses and is mode-independent', () => {
    const source = readSource(RECOVERY_ROUTE);
    const layout = readSource(AUTHENTICATED_LAYOUT);

    expect(source).toContain('api.business.listMyClosedBusinesses');
    expect(source).toContain('עסקים סגורים');
    expect(source).toContain('אין עסקים סגורים לשחזור');
    expect(source).toContain('business.lastClosedAt ?? business.closedAt');
    expect(source).toContain('business.logoUrl');
    expect(layout).toContain("currentSegments.includes('business-recovery')");
    expect(layout).toContain('inJoin || inBusinessRecovery');
    expect(layout).toContain('<Stack.Screen name="business-recovery" />');
  });

  test('restore activates the business and waits for ActiveBusinessContext before dashboard navigation', () => {
    const source = readSource(RECOVERY_ROUTE);
    const restoreIndex = source.indexOf('await restoreBusinessAccount');
    const activeBusinessIndex = source.indexOf(
      'await setActiveBusiness({ businessId: restored.businessId })'
    );
    const persistedModeIndex = source.indexOf(
      "await setActiveMode({ mode: 'business' })"
    );
    const localModeIndex = source.indexOf("await setAppMode('business')");
    const dashboardIndex = source.indexOf(
      "router.replace('/(authenticated)/(business)/dashboard')"
    );

    expect(source).toContain('api.business.restoreBusinessAccount');
    expect(source).toContain('לשחזר את העסק?');
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(activeBusinessIndex).toBeGreaterThan(restoreIndex);
    expect(persistedModeIndex).toBeGreaterThan(activeBusinessIndex);
    expect(localModeIndex).toBeGreaterThan(persistedModeIndex);
    expect(source).toContain('activeBusinessId !== pendingRestoredBusinessId');
    expect(source).toContain(
      'business.businessId === pendingRestoredBusinessId'
    );
    expect(dashboardIndex).toBeGreaterThan(-1);
  });

  test('recovery keeps start-fresh onboarding separate from preserved closed businesses', () => {
    const source = readSource(RECOVERY_ROUTE);

    expect(source).toContain('getBusinessOnboardingEntryRoute');
    expect(source).toContain('פתיחת עסק חדש');
    expect(source).toContain(
      'העסק הסגור יישאר שמור ותוכלו לשחזר אותו גם בהמשך.'
    );
    expect(source).not.toContain('closeBusinessAccount');
    expect(source).not.toContain('deleteMyAccountHard');
    expect(source).not.toContain('ctx.db.patch');
  });

  test('customer CTA prefers an active business and offers recovery when only closed businesses exist', () => {
    const source = readSource(BUSINESS_MODE_CTA);

    expect(source).toContain('api.business.listMyClosedBusinesses');
    expect(source).toContain('!isBusinessMode && !hasManageableBusiness');
    expect(source).toContain('יש לך עסק סגור ב-StampAix');
    expect(source).toContain('showClosedBusinessRecovery');
    expect(source).toContain(`router.push('${RECOVERY_PATH}')`);
    expect(source).toContain('activeManagedBusiness ??');
  });

  test('authoritative wallet and detail queries hide closed cards without mutating memberships', () => {
    const source = readSource(MEMBERSHIPS_BACKEND);
    const walletCardsQuery = sourceBetween(
      source,
      'export const byCustomer = query({',
      'export const getMembershipActivity = query({'
    );
    const detailQuery = sourceBetween(
      source,
      'export const getMembershipActivity = query({',
      'export const byCustomerBusinesses = query({'
    );
    const walletBusinessesQuery = sourceBetween(
      source,
      'export const byCustomerBusinesses = query({',
      'export const getBusinessRewardEligibilitySummary = query({'
    );

    expect(walletCardsQuery).toContain('business.isActive !== true');
    expect(walletBusinessesQuery).toContain('business.isActive !== true');
    expect(detailQuery).toContain('business.isActive !== true');
    expect(detailQuery).toContain('return [];');
    expect(walletCardsQuery).not.toContain('ctx.db.patch');
    expect(walletBusinessesQuery).not.toContain('ctx.db.patch');
    expect(detailQuery).not.toContain('ctx.db.patch');
  });
});
