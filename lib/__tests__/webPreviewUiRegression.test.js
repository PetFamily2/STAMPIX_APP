import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolveCampaignManagementVisualMeta } from '../campaigns/managementPresentation';

describe('Web/PWA device screenshot regressions', () => {
  test('wallet cards size naturally in a column and use a basis only in the wide row', () => {
    const source = readFileSync(
      'app/(authenticated)/(customer)/wallet.web.tsx',
      'utf8'
    );
    const mobileStyle = source.match(/\bcard: \{([^}]+)\}/)?.[1];
    expect(mobileStyle).toBeDefined();
    expect(mobileStyle).not.toMatch(/flexBasis|flexGrow|\bheight\b/);
    expect(source).toContain('cardWide: { flexGrow: 1, flexBasis: 300 }');
    expect(source).toContain('wide ? styles.cardWide : null');
    expect(source.match(/wide=\{wide\}/g)).toHaveLength(2);
    expect(source).toContain('label="לעמוד העסק"');
    expect(source).toContain(
      'customerBusinessRoute(String(business.businessId))'
    );
  });

  test('the search focus ring belongs to the rounded container, not its inset input', () => {
    const css = readFileSync('global.css', 'utf8');
    const component = readFileSync(
      'components/business-web/BusinessWebCustomers.tsx',
      'utf8'
    );
    expect(component).toContain('nativeID="business-customer-search"');
    expect(component).toContain('accessibilityLabel="חיפוש לקוחות"');
    expect(css).toMatch(
      /#business-customer-search:focus-within\s*\{[^}]*outline: 2px solid #1230a8;/
    );
    expect(css).toMatch(
      /#business-customer-search input:focus-visible\s*\{\s*outline: none;/
    );
    expect(css).toContain('input:focus-visible,');
  });

  test('campaign rows use the existing Hebrew labels for titles and subtitles', () => {
    const source = readFileSync(
      'components/business-web/BusinessWebLoyalty.tsx',
      'utf8'
    );
    expect(source).not.toContain('{campaign.type}');
    expect(source).not.toContain('campaign.messageTitle || campaign.type');
    expect(
      source.match(
        /resolveCampaignManagementVisualMeta\(campaign.type\).label/g
      )
    ).toHaveLength(2);
    for (const [type, label] of [
      ['promo', 'קמפיין כללי'],
      ['birthday', 'יום הולדת'],
      ['winback', 'השבת לקוחות'],
      ['unknown', 'קמפיין כללי'],
    ]) {
      expect(resolveCampaignManagementVisualMeta(type).label).toBe(label);
    }
  });
});
