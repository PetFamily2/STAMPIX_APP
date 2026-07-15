import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

globalThis.__DEV__ = true;

const { isPreviewQueryParamEnabled, resolvePreviewModeFromParams } =
  await import('../previewMode');

const PREVIEW_MODE_CALLERS = [
  'app/(auth)/_layout.tsx',
  'app/(auth)/paywall/index.tsx',
  'app/(auth)/sign-up-email.tsx',
  'app/(auth)/sign-up.tsx',
  'app/(auth)/welcome.tsx',
  'app/(authenticated)/(business)/_layout.tsx',
  'app/(authenticated)/(business)/cards/campaigns.tsx',
  'app/(authenticated)/(business)/cards/index.tsx',
  'app/(authenticated)/(business)/customers.tsx',
  'app/(authenticated)/(business)/dashboard.tsx',
  'app/(authenticated)/(business)/scanner.tsx',
  'app/(authenticated)/(business)/team/add.tsx',
  'app/(authenticated)/(business)/team/index.tsx',
  'app/(authenticated)/(staff)/_layout.tsx',
  'app/(authenticated)/(staff)/customers.tsx',
  'app/(authenticated)/(staff)/promotions.tsx',
  'app/(authenticated)/_layout.tsx',
  'app/(authenticated)/card/[membershipId].tsx',
  'app/(authenticated)/merchant/_layout.tsx',
  'app/(authenticated)/merchant/onboarding/_layout.tsx',
  'components/business/BusinessCustomerCardScreen.tsx',
];

const GUARDED_ROUTING_CALLERS = [
  'app/(auth)/_layout.tsx',
  'app/(authenticated)/_layout.tsx',
  'app/(authenticated)/(business)/_layout.tsx',
  'app/(authenticated)/(staff)/_layout.tsx',
];

const SOURCE_ROOTS = ['app', 'components', 'contexts', 'hooks', 'lib', 'screens'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const RAW_PREVIEW_PATTERNS = [
  /\|\|\s*map\s*={2,3}\s*['"]true['"]/,
  /\bmap\s*==\s*['"]true['"]/,
  /\bisPreviewMode\s*=\s*[^;\n]*\bmap\s*={2,3}\s*['"]true['"]/,
];

function sourceFiles(root) {
  const rootPath = path.join(process.cwd(), root);
  const entries = readdirSync(rootPath);
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      files.push(...sourceFiles(path.join(root, entry)));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entryPath))) {
      files.push(entryPath);
    }
  }

  return files;
}

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

describe('preview mode query decision', () => {
  test('development with map=true enables preview mode', () => {
    expect(
      resolvePreviewModeFromParams({ map: 'true', isDevMode: true })
    ).toBe(true);
  });

  test('development with missing map keeps preview mode off', () => {
    expect(resolvePreviewModeFromParams({ isDevMode: true })).toBe(false);
  });

  test('development with map=false keeps preview mode off', () => {
    expect(
      resolvePreviewModeFromParams({ map: 'false', isDevMode: true })
    ).toBe(false);
  });

  test('production with map=true keeps preview mode off', () => {
    expect(
      resolvePreviewModeFromParams({ map: 'true', isDevMode: false })
    ).toBe(false);
  });

  test('production with missing map keeps preview mode off', () => {
    expect(resolvePreviewModeFromParams({ isDevMode: false })).toBe(false);
  });

  test('preview=true remains development-only', () => {
    expect(
      resolvePreviewModeFromParams({ preview: 'true', isDevMode: true })
    ).toBe(true);
    expect(
      resolvePreviewModeFromParams({ preview: 'true', isDevMode: false })
    ).toBe(false);
  });

  test('array query-param values are enabled only when true is present', () => {
    expect(isPreviewQueryParamEnabled(['false', 'true'])).toBe(true);
    expect(isPreviewQueryParamEnabled(['false'])).toBe(false);
    expect(
      resolvePreviewModeFromParams({
        map: ['false', 'true'],
        isDevMode: true,
      })
    ).toBe(true);
    expect(
      resolvePreviewModeFromParams({
        map: ['false', 'true'],
        isDevMode: false,
      })
    ).toBe(false);
  });
});

describe('preview mode source regressions', () => {
  test('all known preview mode callers use the gated helper', () => {
    for (const caller of PREVIEW_MODE_CALLERS) {
      const source = readSource(caller);

      expect(source).toContain('resolvePreviewModeFromParams');
      expect(source).toContain(
        'const isPreviewMode = resolvePreviewModeFromParams({ preview, map });'
      );
    }
  });

  test('auth, authenticated, business and staff guards use the gated result', () => {
    for (const caller of GUARDED_ROUTING_CALLERS) {
      const source = readSource(caller);

      expect(source).toContain('resolvePreviewModeFromParams');
      expect(source).toContain('isPreviewMode');
    }
  });

  test('source has no raw map=true preview bypass patterns', () => {
    const files = SOURCE_ROOTS.flatMap(sourceFiles);
    const offenders = [];

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file).replaceAll('\\', '/');
      const source = readFileSync(file, 'utf8');

      for (const pattern of RAW_PREVIEW_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push(relativePath);
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
