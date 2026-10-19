import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScannerProgramTiles } from '../../components/web-scanner/ScannerProgramTiles.web';

const programs = [
  {
    loyaltyProgramId: 'a',
    title: 'קפה',
    rewardName: 'קפה מתנה',
    maxStamps: 10,
  },
  { loyaltyProgramId: 'b', title: 'ארוחה', maxStamps: 8 },
];
describe('compact scanner program choices', () => {
  test('active management cards combine a green frame and a text indicator', () => {
    const source = readFileSync(
      'components/business-web/LoyaltyManagementEntry.tsx',
      'utf8'
    );
    expect(source).toContain("lifecycle === 'active' ? styles.rowLive : null");
    expect(source).toContain('borderColor: TOKENS.colors.success');
    expect(source).toContain('`✓ ${lifecycleLabel}`');
  });
  test('renders actual buttons and announces selection and active lifecycle', () => {
    const html = renderToStaticMarkup(
      createElement(ScannerProgramTiles, {
        programs,
        selectedId: 'a',
        disabled: false,
        recoveryId: null,
        onSelect: () => {},
      })
    );
    expect(html).not.toContain('<select');
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('פעילה');
    expect(html).toContain('נבחרה לסריקה');
    expect(html).toContain('10');
    expect(html).toContain('קפה מתנה');
  });
  test('locks all choices during unresolved recovery and keeps unavailable prior program readable', () => {
    const html = renderToStaticMarkup(
      createElement(ScannerProgramTiles, {
        programs,
        selectedId: 'old',
        disabled: true,
        recoveryId: 'old',
        onSelect: () => {
          throw Error('must not select');
        },
      })
    );
    expect(html).toContain('בירור הפעולה הקודמת');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
