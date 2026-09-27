import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readSource = (path) => readFileSync(path, 'utf8');

const ACTION_BUTTON = 'components/ui/ActionButton.tsx';
const ACCOUNT = 'app/(authenticated)/(business)/settings-business-account.tsx';
const DASHBOARD = 'app/(authenticated)/(business)/dashboard.tsx';
const CARDS = 'app/(authenticated)/(business)/cards/index.tsx';
const CAMPAIGNS = 'app/(authenticated)/(business)/cards/campaigns.tsx';
const EDITOR_ACTIONS = 'components/management/EditorPrimitives.tsx';
const CAMPAIGN_EDITOR =
  'app/(authenticated)/(business)/cards/campaign/[campaignId].tsx';
const REFERRAL_EMPTY_STATE = 'components/referrals/ReferralEmptyState.tsx';
const SCANNER = 'app/(authenticated)/(business)/scanner.tsx';
const PROGRAM_TILE = 'components/loyalty/LoyaltyProgramTile.tsx';

describe('business account completion contract', () => {
  test('edits both name parts and phone with one dirty-group save action', () => {
    const source = readSource(ACCOUNT);

    expect(source).toContain('label="שם פרטי"');
    expect(source).toContain('label="שם משפחה"');
    expect(source).toContain('label="טלפון אישי"');
    expect(source).toContain('api.users.setMyName');
    expect(source).toContain('api.users.setMyPhone');
    expect(source).toContain('if (isNameDirty)');
    expect(source).toContain('if (isPhoneDirty)');
    expect(source).toContain('hasUnsavedChanges && !isSaving');
    expect(source).toContain('label="שמירה"');
  });

  test('keeps email visibly read-only', () => {
    const source = readSource(ACCOUNT);
    const emailStart = source.indexOf('label="אימייל"');
    const phoneStart = source.indexOf('label="טלפון אישי"');
    const emailField = source.slice(emailStart, phoneStart);

    expect(emailStart).toBeGreaterThan(-1);
    expect(emailField).toContain('readOnly={true}');
    expect(emailField).toContain('לקריאה בלבד');
  });
});

describe('shared Android-safe action contract', () => {
  test('keeps touch on the outer Pressable and paint on an inner View', () => {
    const source = readSource(ACTION_BUTTON);
    const pressableStart = source.indexOf('<Pressable');
    const surfaceStart = source.indexOf('<View', pressableStart);

    expect(pressableStart).toBeGreaterThan(-1);
    expect(surfaceStart).toBeGreaterThan(pressableStart);
    expect(source).toContain('collapsable={false}');
    expect(source).toContain('pointerEvents="none"');
    expect(source).toContain('borderRadius: 999');
    expect(source).toContain('minHeight: 48');
    expect(source).toContain("backgroundColor: '#2F6BFF'");
    expect(source).toContain("backgroundColor: '#D5DCE8'");
    expect(source).toContain('variant?: ActionButtonVariant');
    expect(source).toContain("'secondary'");
    expect(source).toContain("'lifecycle'");
  });

  test('is used by every approved business CTA surface', () => {
    const dashboard = readSource(DASHBOARD);
    const cards = readSource(CARDS);
    const campaigns = readSource(CAMPAIGNS);
    const editorActions = readSource(EDITOR_ACTIONS);
    const campaignEditor = readSource(CAMPAIGN_EDITOR);
    const referralEmpty = readSource(REFERRAL_EMPTY_STATE);

    expect(dashboard).toContain('label="הזמנת עסק"');
    expect(cards).toContain('label={TEXT.createNewCard}');
    expect(cards).toContain("createNewCard: 'צור כרטיסייה חדשה'");
    expect(campaigns).toContain('label="צור קמפיין"');
    expect(editorActions.match(/<ActionButton/g)?.length).toBe(3);
    expect(editorActions).toContain('variant="secondary"');
    expect(editorActions).toContain('variant={lifecycleVariant}');
    expect(editorActions).toContain('Math.max(insets.bottom, 12)');
    expect(editorActions).toContain('zIndex: 20');
    expect(campaignEditor).toContain('primaryLabel={');
    expect(campaignEditor).toContain('secondaryLabel="שמור טיוטה"');
    expect(campaignEditor).toContain("isArchivedCampaign ? 'שחזור כטיוטה'");
    expect(campaignEditor).toContain(": 'העבר לארכיון'");
    expect(referralEmpty).toContain('variant="secondary"');
  });
});

describe('scanner completion contract', () => {
  test('keeps five compact columns in separate flow layout regions', () => {
    const source = readSource(SCANNER);
    const tile = readSource(PROGRAM_TILE);

    expect(source).toContain('getProgramGridMetrics(contentWidth, isTablet)');
    expect(source).toContain(
      '{ width: programGridWidth, gap: PROGRAM_GRID_GAP }'
    );
    expect(source).toContain(
      '<View collapsable={false} style={styles.programGridRegion}>'
    );
    expect(source).toContain('minHeight: 101');
    expect(source).toContain("flexWrap: 'wrap'");
    expect(source).toContain('{renderProgramContext()}');
    expect(source).toContain('styles.transactionArea');
    expect(tile).toContain('const PROGRAM_TILE_HEIGHT = 101');
    expect(tile).toContain('numberOfLines={2}');
    expect(tile).toContain('selected ? styles.selected : null');
    expect(tile).toContain('elevation: 5');
  });

  test('preserves selection persistence and wraps undo in the shared pill', () => {
    const source = readSource(SCANNER);
    const undoStart = source.indexOf('result.undo &&');
    const undoEnd = source.indexOf(') : null}', undoStart);
    const undoUi = source.slice(undoStart, undoEnd);

    expect(source).toContain(
      '`scanner:lastProgram:$' + '{String(activeBusinessId)}`'
    );
    expect(source).toContain('await AsyncStorage.getItem(storageKey)');
    expect(source).toContain(
      'await AsyncStorage.setItem(storageKey, programId)'
    );
    expect(undoUi).toContain('<ActionButton');
    expect(undoUi).toContain('variant="secondary"');
    expect(undoUi).toContain('onPress={() => void handleUndo()}');
    expect(source).toContain('undoLastScannerAction({');
    expect(source).toContain('formatUndoCountdown(');
  });
});
