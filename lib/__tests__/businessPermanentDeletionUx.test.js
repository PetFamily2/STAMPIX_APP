import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const ROUTE = 'app/(authenticated)/business-permanent-deletion.tsx';
const BACKEND = 'convex/businessDeletion.ts';
const AUTHENTICATED_LAYOUT = 'app/(authenticated)/_layout.tsx';
const BUSINESS_SETTINGS = 'screens/BusinessSettingsScreen.tsx';
const BUSINESS_RECOVERY = 'app/(authenticated)/business-recovery.tsx';
const PERSONAL_SETTINGS = 'screens/SettingsScreen.tsx';

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

describe('permanent business deletion UX', () => {
  test('route is authenticated, mode-independent, and uses only the Batch 2 public API', () => {
    const route = readSource(ROUTE);
    const layout = readSource(AUTHENTICATED_LAYOUT);

    expect(route).toContain(
      'api.businessDeletion.listMyBusinessesForPermanentDeletion'
    );
    expect(route).toContain('api.businessDeletion.deleteBusinessPermanently');
    expect(route).toContain(
      'api.businessDeletion.getPermanentBusinessDeletionStatus'
    );
    expect(route).toContain(
      'api.businessDeletion.retryPermanentBusinessDeletion'
    );
    expect(layout).toContain("'business-permanent-deletion'");
    expect(layout).toContain('inBusinessPermanentDeletion');
    expect(layout).toContain(
      '<Stack.Screen name="business-permanent-deletion" />'
    );
  });

  test('Business Settings keeps reversible closure and adds a separate owner-only permanent action', () => {
    const source = readSource(BUSINESS_SETTINGS);

    expect(source).toContain("activeBusiness?.staffRole === 'owner'");
    expect(source).toContain('api.business.closeBusinessAccount');
    expect(source).toContain('סגירת העסק ב-StampAix');
    expect(source).toContain('יהיה ניתן לשחזר');
    expect(source).toContain('מחיקת העסק לצמיתות');
    expect(source).toContain('פעולה בלתי הפיכה');
    expect(source).toContain('handlePermanentBusinessDeletion');
    expect(source).toContain(
      '/(authenticated)/business-permanent-deletion?businessId='
    );
  });

  test('recovery keeps Restore primary and separates deletion-locked businesses', () => {
    const source = readSource(BUSINESS_RECOVERY);
    const restoreIndex = source.indexOf('styles.restoreButton');
    const deleteIndex = source.indexOf('styles.permanentDeleteArea');

    expect(source).toContain('api.business.listMyClosedBusinesses');
    expect(source).toContain(
      'api.businessDeletion.listMyBusinessesForPermanentDeletion'
    );
    expect(source).toContain("restore: 'שחזור העסק'");
    expect(source).toContain('מחיקה לצמיתות');
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(restoreIndex);
    expect(source).toContain("status === 'failed'");
    expect(source).toContain('עסקים בתהליך מחיקה');
    expect(source).toContain('styles.deletionStatusButton');
  });

  test('new deletion uses warning then normalized typed-name confirmation and submits the original input', () => {
    const source = readSource(ROUTE);
    const warningIndex = source.indexOf('if (!warningAccepted)');
    const inputIndex = source.indexOf('<TextInput', warningIndex);
    const mutationIndex = source.indexOf('await requestDeletion({');

    expect(source).toContain("value.normalize('NFKC')");
    expect(source).toContain("trim().replace(/\\s+/g, ' ').toLowerCase()");
    expect(warningIndex).toBeGreaterThan(-1);
    expect(inputIndex).toBeGreaterThan(warningIndex);
    expect(source).toContain('disabled={!nameMatches || requesting}');
    expect(source).toContain('requestInFlightRef.current');
    expect(mutationIndex).toBeGreaterThan(-1);
    expect(source.slice(mutationIndex, mutationIndex + 220)).toContain(
      'confirmationBusinessName: confirmationName'
    );
  });

  test('accepted, completed, and failed states remain distinct and failed jobs can retry', () => {
    const source = readSource(ROUTE);

    expect(source).toContain(
      'בקשת המחיקה התקבלה. העסק אינו זמין עוד והמחיקה מתבצעת ברקע.'
    );
    expect(source).toContain("effectiveJobStatus === 'completed'");
    expect(source).toContain('העסק נמחק לצמיתות.');
    expect(source).toContain("effectiveJobStatus === 'failed'");
    expect(source).toContain('לא הצלחנו להשלים את מחיקת העסק.');
    expect(source).toContain('await retryDeletion({ jobId: targetJobId })');
    expect(source).toContain('retryInFlightRef.current');
    expect(source).not.toContain('ביטול המחיקה');
    expect(source).not.toContain('שחזור העסק');
  });

  test('existing jobs are rediscovered from listing fields without returning to confirmation', () => {
    const source = readSource(ROUTE);
    const existingJobIndex = source.indexOf(
      'selectedBusiness.permanentDeletionJobId'
    );
    const statusBranchIndex = source.indexOf(
      'if (hasExistingJob || jobId)'
    );
    const warningBranchIndex = source.indexOf(
      'if (!warningAccepted)',
      statusBranchIndex
    );

    expect(existingJobIndex).toBeGreaterThan(-1);
    expect(source).toContain('selectedBusiness.permanentDeletionJobStatus');
    expect(source).toContain('selectedBusiness.permanentDeletionPhase');
    expect(statusBranchIndex).toBeGreaterThan(-1);
    expect(warningBranchIndex).toBeGreaterThan(statusBranchIndex);
  });

  test('root-missing unfinished jobs use the requester-indexed synthetic listing contract', () => {
    const backend = readSource(BACKEND);

    expect(backend).toContain(
      ".withIndex('by_requestedByUserId_status', (q: any) =>"
    );
    expect(backend).toContain(
      "for (const status of ['queued', 'running', 'failed'] as const)"
    );
    expect(backend).toContain(
      'String(job.requestedByUserId) !== String(user._id)'
    );
    expect(backend).toContain("ctx.db.normalizeId('businesses', job.businessId)");
    expect(backend).toContain('if (business)');
    expect(backend).toContain('businessExists: false as const');
    expect(backend).toContain('name: job.businessNameSnapshot');
    expect(backend).toContain('permanentDeletionJobId: job._id');
    expect(backend).toContain('permanentDeletionJobStatus: job.status');
    expect(backend).toContain('permanentDeletionPhase: job.phase');
    expect(backend).toContain('permanentDeletionFailureCode: job.failureCode');
    expect(backend).toContain('businessExists: true as const');
  });

  test('synthetic queued, running, and failed entries stay in job status UX and never restart deletion', () => {
    const source = readSource(ROUTE);
    const statusBranchIndex = source.indexOf('if (hasExistingJob || jobId)');
    const rootMissingGuardIndex = source.indexOf(
      'selectedBusiness.businessExists === false',
      statusBranchIndex
    );
    const warningBranchIndex = source.indexOf(
      'if (!warningAccepted)',
      rootMissingGuardIndex
    );

    expect(source).toContain(
      "return value === 'queued' || value === 'running' || value === 'failed'"
    );
    expect(source).toContain('getProgressLabel(business.permanentDeletionPhase)');
    expect(source).toContain("const isFailed = status === 'failed'");
    expect(source).toContain('await retryDeletion({ jobId: targetJobId })');
    expect(source).toContain(
      'business.businessExists === true && !isDeleting'
    );
    expect(source).toContain('selectedBusiness.businessExists === false ||');
    expect(statusBranchIndex).toBeGreaterThan(-1);
    expect(rootMissingGuardIndex).toBeGreaterThan(statusBranchIndex);
    expect(warningBranchIndex).toBeGreaterThan(rootMissingGuardIndex);
  });

  test('account deletion success is gated by the complete real-and-synthetic listing', () => {
    const source = readSource(ROUTE);
    const emptyStateIndex = source.indexOf('if (businesses.length === 0)');
    const accountSuccessIndex = source.indexOf('TEXT.accountReturn', emptyStateIndex);
    const listRenderIndex = source.indexOf('businesses.map((business) => {');

    expect(emptyStateIndex).toBeGreaterThan(-1);
    expect(accountSuccessIndex).toBeGreaterThan(emptyStateIndex);
    expect(listRenderIndex).toBeGreaterThan(accountSuccessIndex);
    expect(source).toContain(
      '(business) => String(business.businessId) === requestedBusinessId'
    );
    expect(source).toContain('selectedBusiness.permanentDeletionJobId');
    expect(source).toContain(
      'העסקים נמחקו. ניתן לחזור ולהמשיך במחיקת החשבון.'
    );
    expect(source).not.toContain('deleteMyAccountHard');
  });

  test('billing blocker opens official cross-platform management without cancellation calls', () => {
    const source = readSource(ROUTE);

    expect(source).toContain('displayBusiness?.billing?.renewalActive === true');
    expect(source).toContain('https://apps.apple.com/account/subscriptions');
    expect(source).toContain(
      'https://play.google.com/store/account/subscriptions'
    );
    expect(source).toContain("displayBusiness?.billing?.status === 'canceled'");
    expect(source).toContain('hasCanceledPaidTime');
    expect(source).not.toContain('cancelSubscription');
    expect(source).not.toContain('Purchases.cancel');
  });

  test('sole-owner account blocker opens management and return requires personal confirmation again', () => {
    const route = readSource(ROUTE);
    const settings = readSource(PERSONAL_SETTINGS);

    expect(settings).toContain("result.errorCode === 'SOLE_OWNER_BUSINESS_BLOCKED'");
    expect(settings).toContain("manageBusinesses: 'ניהול עסקים'");
    expect(settings).toContain(
      "pathname: '/(authenticated)/business-permanent-deletion'"
    );
    expect(settings).toContain("params: { returnTo: 'account-deletion' }");
    expect(route).toContain(
      '/(authenticated)/(customer)/settings?resumeAccountDeletion=true'
    );
    expect(settings).toContain('setDeleteStep(1)');
    expect(settings).toContain("placeholder=\"DELETE\"");
    expect(route).not.toContain('deleteMyAccountHard');
    expect(settings).not.toContain(
      'openBusinessDeletionResolution();\n      await deleteMyAccountHard'
    );
  });

  test('route uses manual RTL, accessible controls, and a tablet-safe content width', () => {
    const source = readSource(ROUTE);

    expect(source).toContain(
      "import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl'"
    );
    expect(source).toContain('flexDirection: flexDirection.row');
    expect(source).toContain("writingDirection: 'rtl'");
    expect(source).toContain("textAlign: 'right'");
    expect(source).toContain('accessibilityLabel="הקלדת שם העסק');
    expect(source).toContain('accessibilityHint=');
    expect(source).toContain('maxWidth: 720');
    expect(source).not.toContain("flexDirection: 'row'");
  });
});
