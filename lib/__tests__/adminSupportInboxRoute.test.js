import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const CANONICAL_ROUTE = 'app/(authenticated)/admin/support-inbox.tsx';
const LEGACY_ROUTE = 'app/(authenticated)/merchant/support-inbox.tsx';
const LEGACY_PATH = '/(authenticated)/merchant/support-inbox';
const PRODUCTION_SOURCE_ROOTS = [
  'app',
  'components',
  'contexts',
  'hooks',
  'lib',
  'screens',
];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

function collectProductionSources(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') {
      return [];
    }

    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return collectProductionSources(path);
    }

    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  });
}

describe('canonical Admin support inbox route', () => {
  test('renders the shared Admin support inbox screen', () => {
    const source = readSource(CANONICAL_ROUTE);

    expect(source).toContain(
      "import AdminSupportInboxScreen from '@/screens/AdminSupportInboxScreen'"
    );
    expect(source).toContain('export default AdminSupportInboxScreen');
  });

  test('redirects the legacy merchant route through the canonical Admin route', () => {
    const source = readSource(LEGACY_ROUTE);

    expect(source).toContain(
      '<Redirect href="/(authenticated)/admin/support-inbox" />'
    );
    expect(source).not.toContain('@/screens/AdminSupportInboxScreen');
  });

  test('has no production navigation entry targeting the legacy merchant path', () => {
    for (const root of PRODUCTION_SOURCE_ROOTS) {
      for (const sourcePath of collectProductionSources(root)) {
        expect(readSource(sourcePath)).not.toContain(LEGACY_PATH);
      }
    }
  });
});
