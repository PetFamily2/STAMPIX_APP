import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const PROGRAM_SOURCE = readFileSync(
  'app/(authenticated)/(business)/cards/[programId].tsx',
  'utf8'
);
const TEAM_SOURCE = readFileSync(
  'app/(authenticated)/(business)/team/index.tsx',
  'utf8'
);
const CARD_SOURCE = readFileSync(
  'app/(authenticated)/card/[membershipId].tsx',
  'utf8'
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('program archive confirmation contract', () => {
  test('visible archive action opens confirmation without invoking the mutation', () => {
    const archiveButton = sourceBetween(
      PROGRAM_SOURCE,
      "{lifecycle === 'active' ? (",
      '{details.canDelete ? ('
    );
    const confirmation = sourceBetween(
      PROGRAM_SOURCE,
      'const handleArchive = () => {',
      'const runDelete = async () => {'
    );

    expect(archiveButton).toContain('onPress={handleArchive}');
    expect(archiveButton).not.toContain('runArchive');
    expect(archiveButton).not.toContain('archiveProgram');
    expect(confirmation).toContain(
      'Alert.alert(TEXT.archiveConfirmTitle, TEXT.archiveConfirmMessage'
    );
    expect(confirmation).toContain("style: 'cancel'");
    expect(confirmation).toContain("style: 'destructive'");
    expect(confirmation).toContain('void runArchive();');
    expect(confirmation).not.toContain('archiveProgram({');
  });

  test('only the confirmed runner invokes archive and copy states the consequences', () => {
    const runner = sourceBetween(
      PROGRAM_SOURCE,
      'const runArchive = async () => {',
      'const handleArchive = () => {'
    );

    expect(runner).toContain('await archiveProgram({');
    expect(PROGRAM_SOURCE).toContain('לא יוכלו עוד לצבור ניקובים');
    expect(PROGRAM_SOURCE).toContain('או לממש הטבות');
    expect(PROGRAM_SOURCE).toContain('לא ניתן כרגע לבטל את הפעולה');
    expect(PROGRAM_SOURCE).toContain(
      "archiveDoneMessage: 'הכרטיסיה אינה זמינה עוד לצבירה או למימוש.'"
    );
  });
});

describe('program unavailable client contract', () => {
  test('loading, unavailable and valid details remain distinct', () => {
    const unavailableBranch = sourceBetween(
      PROGRAM_SOURCE,
      'if (details === null) {',
      'const lifecycle ='
    );

    expect(PROGRAM_SOURCE).toContain(
      ') as ProgramDetails | null | undefined;'
    );
    expect(PROGRAM_SOURCE).toContain('{details === undefined ? (');
    expect(PROGRAM_SOURCE).toContain('{details !== undefined ? (');
    expect(unavailableBranch).toContain('TEXT.unavailableTitle');
    expect(unavailableBranch).toContain('TEXT.unavailableMessage');
    expect(unavailableBranch).toContain('TEXT.backToPrograms');
    expect(unavailableBranch).toContain(
      "safeBack('/(authenticated)/(business)/programs')"
    );
    expect(unavailableBranch).not.toContain('<LoyaltyCard');
  });
});

describe('team member removal confirmation contract', () => {
  test('visible action passes the member name into confirmation only', () => {
    const staffCards = sourceBetween(
      TEAM_SOURCE,
      'const renderStaffCard = (',
      'const renderInviteStatusLabel ='
    );
    const confirmation = sourceBetween(
      TEAM_SOURCE,
      'const handleRemove = (staffId: string, displayName: string) => {',
      'const activeRows ='
    );

    expect(staffCards).toContain(
      'handleRemove(member.staffId, member.displayName);'
    );
    expect(staffCards).not.toContain('runRemove(member.staffId)');
    expect(confirmation).toContain('displayName.trim()');
    expect(confirmation).toContain("style: 'cancel'");
    expect(confirmation).toContain("style: 'destructive'");
    expect(confirmation).toContain('void runRemove(staffId);');
    expect(confirmation).not.toContain('removeStaff({');
  });

  test('confirmed runner retains the existing mutation and capability gate', () => {
    const runner = sourceBetween(
      TEAM_SOURCE,
      'const runRemove = async (staffId: string) => {',
      'const handleRemove = (staffId: string, displayName: string) => {'
    );

    expect(runner).toContain('await removeStaff({');
    expect(TEAM_SOURCE).toContain('!member.isSelf &&');
    expect(TEAM_SOURCE).toContain('canManageTeam &&');
    expect(TEAM_SOURCE).toContain("section !== 'removed' &&");
    expect(TEAM_SOURCE).toContain(
      "(isOwner ? member.staffRole !== 'owner' : member.staffRole === 'staff')"
    );
    expect(TEAM_SOURCE).toContain('תבוטל מייד');
    expect(TEAM_SOURCE).toContain('להזמין את חבר/ת הצוות מחדש');
  });
});

describe('customer card recovery contract', () => {
  test('missing id and unavailable membership both return safely to Wallet', () => {
    const missingIdBranch = sourceBetween(
      CARD_SOURCE,
      'if (!membershipId) {',
      'if (!membership) {'
    );
    const unavailableMembershipBranch = sourceBetween(
      CARD_SOURCE,
      'if (!membership) {',
      'const current ='
    );

    for (const branch of [missingIdBranch, unavailableMembershipBranch]) {
      expect(branch).toContain('TEXT.backToWallet');
      expect(branch).toContain(
        "safeBack('/(authenticated)/(customer)/wallet')"
      );
    }
    expect(CARD_SOURCE).toContain("backToWallet: 'חזרה לארנק'");
  });
});
