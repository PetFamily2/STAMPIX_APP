import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  getDashboardLayout,
  getDashboardLayoutMode,
} from '../design/dashboardTokens';
import {
  chunkQuickActionItems,
  getQuickActionColumnCount,
  getQuickActionContentWidth,
  getQuickActionRowCount,
  getQuickActionTileWidth,
  QUICK_ACTION_MIN_TAP_TARGET,
  QUICK_ACTION_TILE_MAX_WIDTH,
} from '../design/quickActionLayout';

const HOME_ACTIONS = ['scanner', 'join', 'team'];

function layoutFor(windowWidth, itemCount = HOME_ACTIONS.length) {
  const layoutMode = getDashboardLayoutMode(windowWidth);
  const layout = getDashboardLayout(layoutMode);
  const contentWidth = getQuickActionContentWidth({
    windowWidth,
    pageHorizontalPadding: layout.pageHorizontalPadding,
  });
  const columns = getQuickActionColumnCount({
    contentWidth,
    itemCount,
    gap: layout.quickShortcutGap,
  });
  const tileWidth = getQuickActionTileWidth({
    contentWidth,
    columns,
    gap: layout.quickShortcutGap,
  });

  return {
    layoutMode,
    contentWidth,
    columns,
    tileWidth,
    gap: layout.quickShortcutGap,
    rows: getQuickActionRowCount(itemCount, columns),
  };
}

function expectTilesFit(result) {
  expect(result.tileWidth).toBeGreaterThanOrEqual(QUICK_ACTION_MIN_TAP_TARGET);
  expect(result.tileWidth).toBeLessThanOrEqual(QUICK_ACTION_TILE_MAX_WIDTH);
  expect(
    result.tileWidth * result.columns + result.gap * (result.columns - 1)
  ).toBeLessThanOrEqual(result.contentWidth);
}

describe('business home quick action layout', () => {
  test('390px keeps the three actions in one equal row', () => {
    const result = layoutFor(390);

    expect(result.layoutMode).toBe('phone');
    expect(result.columns).toBe(3);
    expect(result.rows).toBe(1);
    expectTilesFit(result);
    expect(chunkQuickActionItems(HOME_ACTIONS, result.columns)).toEqual([
      HOME_ACTIONS,
    ]);
  });

  test('360px keeps the three actions in one equal row', () => {
    const result = layoutFor(360);

    expect(result.layoutMode).toBe('compact');
    expect(result.columns).toBe(3);
    expect(result.rows).toBe(1);
    expectTilesFit(result);
  });

  test('320px wraps to two equal columns instead of crushing the row', () => {
    const result = layoutFor(320);

    expect(result.layoutMode).toBe('compact');
    expect(result.columns).toBe(2);
    expect(result.rows).toBe(2);
    expectTilesFit(result);
    expect(chunkQuickActionItems(HOME_ACTIONS, result.columns)).toEqual([
      ['scanner', 'join'],
      ['team'],
    ]);
  });

  test('business home keeps the existing quick action routes and labels', () => {
    const source = readFileSync(
      'app/(authenticated)/(business)/dashboard.tsx',
      'utf8'
    );
    const snapshotIndex = source.indexOf('תמונת מצב');
    const quickActionsIndex = source.indexOf('פעולות מהירות');
    const activityIndex = source.indexOf('פעילות אחרונה');

    expect(source).toContain("label: 'סריקת לקוח'");
    expect(source).toContain("icon: 'scan-outline'");
    expect(source).toContain(
      "openRoute('/(authenticated)/(business)/scanner')"
    );
    expect(source).toContain("label: 'צרפו לקוחות'");
    expect(source).toContain("icon: 'qr-code-outline'");
    expect(source).toContain("openRoute('/(authenticated)/(business)/qr')");
    expect(source).toContain("label: 'הוספת עובד'");
    expect(source).toContain("icon: 'person-add-outline'");
    expect(source).toContain('onPress: openTeamShortcut');
    expect(source).toContain(
      'isLocked: teamGate.isLocked || isTeamSeatLimitReached'
    );
    expect(quickActionsIndex).toBeGreaterThan(snapshotIndex);
    expect(activityIndex).toBeGreaterThan(quickActionsIndex);
  });
});
