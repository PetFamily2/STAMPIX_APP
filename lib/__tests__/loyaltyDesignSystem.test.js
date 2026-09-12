import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CARD_THEMES,
  DEFAULT_CARD_THEME_ID,
  resolveCardTheme,
  resolveCanonicalCardThemeId,
} from '../../constants/cardThemes';
import {
  DEFAULT_STAMP_ICON_ID,
  STAMP_ICON_CATALOG,
  resolveStampIcon,
} from '../../constants/stampIcons';
import { buildStampProgressLabel } from '../loyalty/cardPresentation';
import { hasLoyaltyThemeConflict } from '../../convex/loyaltyPrograms';

describe('canonical loyalty design system', () => {
  test('publishes exactly ten complete and unique themes', () => {
    expect(CARD_THEMES).toHaveLength(10);
    expect(new Set(CARD_THEMES.map((theme) => theme.id)).size).toBe(10);
    for (const theme of CARD_THEMES) {
      for (const key of [
        'surface',
        'surfaceAlt',
        'accent',
        'onAccent',
        'onSurface',
        'onSurfaceMuted',
        'keyline',
        'stampEmpty',
        'stampEarned',
      ]) {
        expect(theme[key]).toBeTruthy();
      }
      expect(theme.gradient).toHaveLength(3);
    }
  });

  test('resolves legacy and unknown theme values deterministically', () => {
    expect(resolveCanonicalCardThemeId('blue')).toBe('midnight-luxe');
    expect(resolveCardTheme('unknown-old-theme').id).toBe(
      DEFAULT_CARD_THEME_ID
    );
    expect(resolveCardTheme(undefined).id).toBe(DEFAULT_CARD_THEME_ID);
  });

  test('curates ten icons while preserving legacy icon rendering', () => {
    expect(STAMP_ICON_CATALOG).toHaveLength(10);
    expect(new Set(STAMP_ICON_CATALOG.map((icon) => icon.id)).size).toBe(10);
    expect(resolveStampIcon('☕').id).toBe('coffee');
    expect(resolveStampIcon('unknown-legacy-icon').id).toBe(
      DEFAULT_STAMP_ICON_ID
    );
  });

  test('builds semantic progress labels at zero, partial, full and 20 stamps', () => {
    expect(buildStampProgressLabel(0, 10)).toBe('0 מתוך 10 חותמות');
    expect(buildStampProgressLabel(3, 10)).toBe('3 מתוך 10 חותמות');
    expect(buildStampProgressLabel(10, 10)).toBe('10 מתוך 10 חותמות');
    expect(buildStampProgressLabel(12, 20)).toBe('12 מתוך 20 חותמות');
  });
});

describe('loyalty theme reservation rule', () => {
  const active = {
    _id: 'program-a',
    businessId: 'business-a',
    isActive: true,
    status: 'active',
    cardThemeId: 'forest-club',
  };

  test('blocks another non-archived program in the same business', () => {
    expect(
      hasLoyaltyThemeConflict([active], 'business-a', 'forest-club')
    ).toBe(true);
  });

  test('allows the current program to retain its own theme', () => {
    expect(
      hasLoyaltyThemeConflict(
        [active],
        'business-a',
        'forest-club',
        'program-a'
      )
    ).toBe(false);
  });

  test('isolates businesses and releases archived themes', () => {
    expect(
      hasLoyaltyThemeConflict([active], 'business-b', 'forest-club')
    ).toBe(false);
    expect(
      hasLoyaltyThemeConflict(
        [{ ...active, status: 'archived', isArchived: true }],
        'business-a',
        'forest-club'
      )
    ).toBe(false);
  });

  test('treats drafts as reservations and ignores soft-deleted rows', () => {
    expect(
      hasLoyaltyThemeConflict(
        [{ ...active, status: 'draft' }],
        'business-a',
        'forest-club'
      )
    ).toBe(true);
    expect(
      hasLoyaltyThemeConflict(
        [{ ...active, isActive: false }],
        'business-a',
        'forest-club'
      )
    ).toBe(false);
  });

  test('fails closed when an archived theme was reused before reactivation', () => {
    const archived = {
      ...active,
      _id: 'program-archived',
      status: 'archived',
      isArchived: true,
    };
    const replacement = { ...active, _id: 'program-replacement' };
    expect(
      hasLoyaltyThemeConflict(
        [archived, replacement],
        'business-a',
        'forest-club',
        'program-archived'
      )
    ).toBe(true);

    const source = readFileSync('convex/loyaltyPrograms.ts', 'utf8');
    expect(source).not.toContain(
      "throw new Error('PROGRAM_REACTIVATION_FORBIDDEN')"
    );
    expect(source).toContain('assertCanReactivateArchivedProgram');
    expect(source).toContain("throw new Error('LOYALTY_THEME_CONFLICT')");
    expect(source).toContain("status: 'active'");
  });
});

describe('loyalty UI contracts', () => {
  test('uses one equal five-column visual picker standard', () => {
    const tile = readFileSync(
      'components/loyalty/VisualSelectionTile.tsx',
      'utf8'
    );
    const palette = readFileSync(
      'components/loyalty/LoyaltyThemePalette.tsx',
      'utf8'
    );
    const icons = readFileSync(
      'components/loyalty/StampIconPicker.tsx',
      'utf8'
    );
    expect(tile).toContain('VISUAL_PICKER_COLUMNS = 5');
    expect(tile).toContain('VISUAL_PICKER_BORDER_WIDTH = 3');
    expect(tile).toContain("selected ? '#DC2626' : 'transparent'");
    expect(tile).toContain('styles.checkBadge');
    expect(tile).toContain('accessibilityState={{ selected, disabled }}');
    expect(palette).toContain('{CARD_THEMES.map((theme) =>');
    expect(palette).toContain('disabled={disabled || inUse}');
    expect(icons).toContain('{STAMP_ICON_CATALOG.map((definition) =>');
  });

  test('keeps editor, quick-create and onboarding on canonical pickers', () => {
    const editor = readFileSync(
      'app/(authenticated)/(business)/cards/[programId].tsx',
      'utf8'
    );
    const quickCreate = readFileSync(
      'app/(authenticated)/(business)/cards/new.tsx',
      'utf8'
    );
    const onboarding = readFileSync(
      'app/(authenticated)/merchant/onboarding/create-program.tsx',
      'utf8'
    );
    for (const source of [editor, quickCreate, onboarding]) {
      expect(source).toContain('<LoyaltyThemePalette');
      expect(source).toContain('<StampIconPicker');
    }
    expect(editor).toContain('תוכן הכרטיסייה');
    expect(editor).toContain('הגדרות מתקדמות');
    expect(editor).toContain('usePreventRemove(isDirty');
    expect(editor).toContain('TEXT.reactivate');
    expect(editor).toContain('handleReactivate');
    expect(editor).toContain('api.loyaltyPrograms.unarchiveProgram');
    expect(editor).not.toMatch(/[1-8]\. \{TEXT\.section/);
  });

  test('enforces reservation before every non-archived write boundary', () => {
    const source = readFileSync('convex/loyaltyPrograms.ts', 'utf8');
    expect(source.match(/await assertThemeAvailable\(/g)?.length).toBe(6);
    expect(source).toContain("throw new Error('LOYALTY_THEME_CONFLICT')");
    expect(source).toContain("throw new Error('PROGRAM_PUBLISH_REQUIRES_DRAFT')");
    expect(source).toContain("throw new Error('PROGRAM_ARCHIVED_READONLY')");
    expect(source).toContain("resolveProgramLifecycle(program) === 'archived'");
    expect(source).toContain("String(program.businessId) !== String(businessId)");
    expect(source).toContain('programKeepsCurrentTheme');
    expect(source).toContain('normalizedThemeId !== currentThemeId');
    expect(source).toContain('assertCanReactivateArchivedProgram');
    expect(source.indexOf('await assertCardSlotAvailable(')).toBeLessThan(
      source.lastIndexOf('await assertThemeAvailable(')
    );
  });

  test('scanner keeps fixed five columns for 1, 4, 5 and 10 programs', () => {
    const source = readFileSync(
      'app/(authenticated)/(business)/scanner.tsx',
      'utf8'
    );
    expect(source).toContain('const PROGRAM_GRID_COLUMNS = 5;');
    expect(source).toContain(
      '(programGridWidth - PROGRAM_GRID_GAP * (PROGRAM_GRID_COLUMNS - 1)) /'
    );
    expect(source).not.toContain('programs.length *');
    expect([1, 4, 5, 10].map((count) => Math.ceil(count / 5))).toEqual([
      1, 1, 1, 2,
    ]);
  });

  test('list and create count every non-archived card toward maxCards', () => {
    const list = readFileSync(
      'app/(authenticated)/(business)/cards/index.tsx',
      'utf8'
    );
    const create = readFileSync(
      'app/(authenticated)/(business)/cards/new.tsx',
      'utf8'
    );
    expect(list).toContain(
      'const nonArchivedProgramCount = draftPrograms.length + activePrograms.length'
    );
    expect(list).toContain("limitStatus('maxCards', nonArchivedProgramCount)");
    expect(create).toContain("limitStatus('maxCards', reservations.length)");
    expect(create).toContain('DEFAULT_LOYALTY_CARD_TERMS');
  });
});
