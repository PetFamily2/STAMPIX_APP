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

  test('does not globally override icon font families', () => {
    const css = readFileSync('global.css', 'utf8');

    expect(css).not.toContain('body * {');
    expect(css).not.toContain('#root * {');
  });
});
