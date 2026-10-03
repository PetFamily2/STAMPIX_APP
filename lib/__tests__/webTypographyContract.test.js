import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('web typography contract', () => {
  test('loads the same Heebo family used by the sales site', () => {
    const css = readFileSync('global.css', 'utf8');

    expect(css).toContain('family=Heebo');
    expect(css).toContain("font-family: 'Heebo', Arial, sans-serif");
    expect(css).toContain('font-synthesis: none');
    expect(css).toContain('text-rendering: optimizeLegibility');
  });

  test('shared AppText applies Heebo only on web', () => {
    const source = readFileSync('components/ui/AppText.tsx', 'utf8');

    expect(source).toContain("Platform.OS === 'web'");
    expect(source).toContain("fontFamily: 'Heebo'");
    expect(source).toContain('NativeText');
  });

  test('Business Web and auth entry surfaces use the shared text primitive', () => {
    const businessShell = readFileSync(
      'components/business-web/BusinessWebShell.tsx',
      'utf8'
    );
    const signup = readFileSync('app/(auth)/sign-up.tsx', 'utf8');
    const welcome = readFileSync('app/(auth)/welcome.tsx', 'utf8');
    const header = readFileSync(
      'components/StandaloneBackTitleHeader.tsx',
      'utf8'
    );

    for (const source of [businessShell, signup, welcome, header]) {
      expect(source).toContain('AppText as Text');
    }
  });

  test('Business Web page headings use the shared medium-bold hierarchy', () => {
    const tokens = readFileSync('lib/design/businessWebTokens.ts', 'utf8');

    expect(tokens).toContain(
      "pageTitle: { fontSize: 26, lineHeight: 34, fontWeight: '700' as const }"
    );
    expect(tokens).toContain(
      "sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const }"
    );
  });

  test('Business Web uses a compact SaaS scale instead of oversized cards', () => {
    const tokens = readFileSync('lib/design/businessWebTokens.ts', 'utf8');
    const shell = readFileSync(
      'components/business-web/BusinessWebShell.tsx',
      'utf8'
    );
    const dashboard = readFileSync(
      'components/business-web/BusinessWebDashboard.tsx',
      'utf8'
    );

    expect(tokens).toContain('lg: 16');
    expect(tokens).toContain('xl: 20');
    expect(tokens).toContain('kpiValue: { fontSize: 28');
    expect(shell).toContain('maxWidth: 1240');
    expect(shell).toContain('width: 220');
    expect(dashboard).toContain('minHeight: 116');
  });

  test('does not globally override icon font families', () => {
    const css = readFileSync('global.css', 'utf8');

    expect(css).not.toContain('body * {');
    expect(css).not.toContain('#root * {');
  });
});
