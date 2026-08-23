import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT_PATH = 'scripts/verify-rtl-build-source.mjs';
const { marker: CANONICAL_MARKER } = JSON.parse(
  fs.readFileSync('config/rtlArchitecture.json', 'utf8')
);
const VALID_RETENTION_ASSIGNMENT =
  '(globalThis as RtlArchitectureGlobal).__APP_RTL_ARCHITECTURE_MARKER__ = RTL_ARCHITECTURE_MARKER;';
const VALID_ROOT_SOURCE =
  "import { retainRtlArchitectureMarker } from '@/lib/rtl';\nretainRtlArchitectureMarker();\n";

function buildRtlSource({
  importStatement = "import rtlArchitecture from '@/config/rtlArchitecture.json';",
  markerDeclaration = 'export const RTL_ARCHITECTURE_MARKER = rtlArchitecture.marker;',
  retentionBody = VALID_RETENTION_ASSIGNMENT,
} = {}) {
  return [
    importStatement,
    markerDeclaration,
    'type RtlArchitectureGlobal = typeof globalThis & {',
    '  __APP_RTL_ARCHITECTURE_MARKER__?: string;',
    '};',
    'export function retainRtlArchitectureMarker() {',
    retentionBody,
    '}',
  ].join('\n');
}

function runScript(args = []) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function createFixture({
  marker = CANONICAL_MARKER,
  includeMarker = true,
  main = 'index.js',
  retentionBody = VALID_RETENTION_ASSIGNMENT,
  rtlSource,
  rootSource = VALID_ROOT_SOURCE,
  indexSource = "require('expo-router/entry');\n",
  screenSource = 'export const screen = true;\n',
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stampaix-rtl-source-'));

  for (const directory of [
    'app',
    'components',
    'screens',
    'lib',
    'constants',
    'config',
  ]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'index.js'), indexSource);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main }));
  fs.writeFileSync(
    path.join(root, 'config/rtlArchitecture.json'),
    JSON.stringify({ mode: 'manual', ...(includeMarker ? { marker } : {}) })
  );
  fs.writeFileSync(
    path.join(root, 'lib/rtl.ts'),
    rtlSource ?? buildRtlSource({ retentionBody })
  );
  fs.writeFileSync(path.join(root, 'app/_layout.tsx'), rootSource);
  fs.writeFileSync(path.join(root, 'screens/FixtureScreen.tsx'), screenSource);

  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function verifyFixture(options, mutate) {
  const fixture = createFixture(options);
  try {
    mutate?.(fixture.root);
    return runScript(['--project-root', fixture.root]);
  } finally {
    fixture.cleanup();
  }
}

describe('verify RTL build source script', () => {
  test('passes on current source without requiring clean git', () => {
    const result = runScript();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `RTL build source verified (${CANONICAL_MARKER}).`
    );
  });

  test('passes a complete manual-RTL fixture', () => {
    const result = verifyFixture();
    expect(result.status).toBe(0);
  });

  test('accepts harmless TypeScript whitespace variation', () => {
    const result = verifyFixture({
      retentionBody: [
        '(',
        '  globalThis',
        '  as RtlArchitectureGlobal',
        ')',
        '.',
        '__APP_RTL_ARCHITECTURE_MARKER__',
        '=',
        'RTL_ARCHITECTURE_MARKER',
        ';',
      ].join('\n'),
      rootSource: [
        'import {',
        '  retainRtlArchitectureMarker',
        '} from',
        "  '@/lib/rtl'",
        ';',
        'retainRtlArchitectureMarker',
        '(',
        ')',
        ';',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts an exact canonical marker declaration with lexical whitespace', () => {
    const result = verifyFixture({
      rtlSource: buildRtlSource({
        markerDeclaration: [
          'export const RTL_ARCHITECTURE_MARKER',
          '  =',
          '  rtlArchitecture',
          '  .',
          '  marker',
          ';',
        ].join('\n'),
      }),
    });
    expect(result.status).toBe(0);
  });

  test('accepts an exact canonical marker declaration without a semicolon', () => {
    const result = verifyFixture({
      rtlSource: buildRtlSource({
        markerDeclaration:
          'export const RTL_ARCHITECTURE_MARKER = rtlArchitecture.marker',
      }),
    });
    expect(result.status).toBe(0);
  });

  test('rejects a canonical marker initializer with a string suffix', () => {
    const result = verifyFixture({
      rtlSource: buildRtlSource({
        markerDeclaration:
          "export const RTL_ARCHITECTURE_MARKER = rtlArchitecture.marker + '-incorrect';",
      }),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config'
    );
  });

  test('rejects a canonical marker initializer followed by another expression operator', () => {
    const result = verifyFixture({
      rtlSource: buildRtlSource({
        markerDeclaration:
          "export const RTL_ARCHITECTURE_MARKER = rtlArchitecture.marker ?? 'fallback';",
      }),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config'
    );
  });

  test('rejects canonical marker declaration text inside a template literal', () => {
    const result = verifyFixture({
      rtlSource: buildRtlSource({
        markerDeclaration: [
          'const markerEvidence = `export const RTL_ARCHITECTURE_MARKER = rtlArchitecture.marker;`;',
          "export const RTL_ARCHITECTURE_MARKER = 'local-only';",
        ].join('\n'),
      }),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config'
    );
  });

  test('accepts unrelated comments and brace-containing regex literals', () => {
    const result = verifyFixture({
      rtlSource: `// Retention contract fixture.\n${buildRtlSource()}\n`,
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const bracePattern = /[{}]/;',
        '// The real call remains a standalone module statement.',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts normal identifier division', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const ratio = total / count;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `RTL build source verified (${CANONICAL_MARKER}).`
    );
  });

  test('accepts division after a function call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const result = getTotal() / count;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts division after a parenthesized expression', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const result = (total + extra) / count;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a regex statement after an if condition', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        "if (true) /safe[{}]/u.test('safe');",
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a regex statement after a completed block', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'if (false) {}',
        "/safe/.test('safe');",
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts regex escapes, character classes, braces, and flags', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const complexPattern = /path\\/[{}a-z]+/giu;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a harmless regex after a semicolonless root import and one genuine root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        "import './harmless-module'",
        "/harmless[{}]/u.test('harmless');",
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts an export-default regex expression without leaking its contents', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'export default',
        "/;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a TSX closing tag', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const element = <View></View>;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a TSX self-closing tag after an expression prop', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'const element = <View value={ratio} />;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts opaque templates with escaped delimiters and nested lexical states', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal template syntax.
        'const evidence = `raw \\${ignored} escaped \\` ${ {',
        "  text: '}',",
        '  regex: /[{}]/,',
        '  note: /* } ${ ` */ 1,',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal nested interpolation.
        '} } middle ${`nested ${/* } */ /[{}]/.source}`} end`;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('fails when the canonical marker is missing', () => {
    const result = verifyFixture({ includeMarker: false });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Canonical RTL architecture marker is wrong'
    );
  });

  test('fails when the canonical marker is wrong', () => {
    const result = verifyFixture({
      marker: 'stampaix-rtl-manual-row-right-v2',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Canonical RTL architecture marker is wrong'
    );
  });

  test('rejects the obsolete native marker', () => {
    const result = verifyFixture({
      marker: 'stampaix-rtl-native-row-right-v4',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Canonical RTL architecture marker is wrong'
    );
  });

  test('fails when a required shared source root is missing', () => {
    const result = verifyFixture(undefined, (root) => {
      fs.rmSync(path.join(root, 'screens'), { recursive: true, force: true });
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing required RTL build source path: screens'
    );
  });

  test('fails when the required index entrypoint is missing', () => {
    const result = verifyFixture(undefined, (root) => {
      fs.rmSync(path.join(root, 'index.js'));
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing required RTL build source path: index.js'
    );
  });

  test('fails when the root layout does not retain the marker', () => {
    const result = verifyFixture({
      rootSource: 'export default function RootLayout() { return null; }\n',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a genuine root call after an unconditional throw', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "throw new Error('stop');",
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a genuine root call after an expression statement', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'initializeSomething();',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a genuine root call after a runtime variable declaration', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const initialized = true;',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a genuine root call after an export-default runtime expression', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'export default createRootLayout();',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a genuine root call after a conditional', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'if (shouldInitialize) { initializeSomething(); }',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a genuine root call after a loop', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'while (shouldInitialize) { initializeSomething(); }',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects an imported runtime binding named type before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { initializer as type } from './initializer';",
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'type.initialize();',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a runtime call named type before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'type();',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects runtime property access named type before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'type.value;',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a malformed type alias without an equals sign', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'type RuntimeEvidence;',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('rejects a runtime export before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'export const runtimeValue = initializeSomething();',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'as the first runtime-executable module statement'
    );
  });

  test('accepts a genuine simple type alias before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "type RootMode = 'manual';",
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a genuine generic type alias before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'type RootValue<T> = { value: T };',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts a genuine interface before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'interface RootContract { value: string }',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts exported erased declarations before the root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "export type ExportedRootMode = 'manual';",
        'export interface ExportedRootContract<T>',
        '  extends Record<string, T> { value: T }',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts type-only declarations before the first runtime root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "type RootMode = 'manual';",
        'interface RootContract { mode: RootMode }',
        'retainRtlArchitectureMarker();',
        'const runtimeValue = true;',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('accepts the first runtime root call before an export default', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'export default function RootLayout() { return null; }',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
  });

  test('rejects a no-op retention function', () => {
    const result = verifyFixture({
      retentionBody: 'void RTL_ARCHITECTURE_MARKER;',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects an empty retention function despite a real root call', () => {
    const result = verifyFixture({ retentionBody: '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects an unconditional return before the retention assignment', () => {
    const result = verifyFixture({
      retentionBody: `return;\n${VALID_RETENTION_ASSIGNMENT}`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects an unconditional throw before the retention assignment', () => {
    const result = verifyFixture({
      retentionBody: `throw new Error('stop');\n${VALID_RETENTION_ASSIGNMENT}`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects a retention assignment inside an unreachable false branch', () => {
    const result = verifyFixture({
      retentionBody: `if (false) {\n${VALID_RETENTION_ASSIGNMENT}\n}`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects a retention assignment inside an unreachable false loop', () => {
    const result = verifyFixture({
      retentionBody: `while (false) {\n${VALID_RETENTION_ASSIGNMENT}\n}`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects a retention assignment that exists only in a comment', () => {
    const result = verifyFixture({
      retentionBody: `// ${VALID_RETENTION_ASSIGNMENT}`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects a retention assignment inside a string literal', () => {
    const result = verifyFixture({
      retentionBody: `const assignmentEvidence = '${VALID_RETENTION_ASSIGNMENT}';`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects a retention assignment inside a template literal', () => {
    const result = verifyFixture({
      retentionBody: [
        'const assignmentEvidence = `',
        VALID_RETENTION_ASSIGNMENT,
        '`;',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects a canonical import inside a multiline template literal', () => {
    const importStatement = [
      'const importEvidence = `',
      "import rtlArchitecture from '@/config/rtlArchitecture.json';",
      '`;',
      "const rtlArchitecture = { marker: 'local-only' };",
    ].join('\n');
    const result = verifyFixture({
      rtlSource: buildRtlSource({ importStatement }),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config'
    );
  });

  test('rejects a fake canonical import inside a nested template literal', () => {
    const importStatement = [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal nested template syntax.
      "const importEvidence = `outer ${`; import rtlArchitecture from '@/config/rtlArchitecture.json'; x`} outer`;",
      "const rtlArchitecture = { marker: 'local-only' };",
    ].join('\n');
    const result = verifyFixture({
      rtlSource: buildRtlSource({ importStatement }),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config'
    );
  });

  test('rejects a fake root import inside a nested template literal', () => {
    const result = verifyFixture({
      rootSource: [
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal nested template syntax.
        "const importEvidence = `outer ${`; import { retainRtlArchitectureMarker } from '@/lib/rtl'; x`} outer`;",
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must import retainRtlArchitectureMarker from the RTL source'
    );
  });

  test('rejects a fake root call inside a nested template literal', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal nested template syntax.
        'const callEvidence = `outer ${`; retainRtlArchitectureMarker(); x`} outer`;',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('does not treat an interpolation call as a standalone module-scope call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal interpolation syntax.
        'const callEvidence = `outer ${retainRtlArchitectureMarker()} end`;',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a fake retention assignment inside a nested template literal', () => {
    const result = verifyFixture({
      retentionBody:
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal nested template syntax.
        'const assignmentEvidence = `outer ${`; (globalThis as RtlArchitectureGlobal).__APP_RTL_ARCHITECTURE_MARKER__ = RTL_ARCHITECTURE_MARKER; x`} outer`;',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('rejects fake import and call evidence across multiple interpolation levels', () => {
    const result = verifyFixture({
      rootSource:
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture contains literal nested template syntax.
        "const evidence = `level1 ${`level2 ${`; import { retainRtlArchitectureMarker } from '@/lib/rtl'; retainRtlArchitectureMarker(); x`} tail`} end`;",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must import retainRtlArchitectureMarker from the RTL source'
    );
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects fake call text after an escaped template backtick', () => {
    const escapedBacktick = '\\`';
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const callEvidence = `escaped ' +
          escapedBacktick +
          ' retainRtlArchitectureMarker();`;',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('fails closed on an unterminated nested template literal', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const evidence = `outer ${`nested',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated template literal'
    );
  });

  test('fails closed on an unterminated template interpolation', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const evidence = `outer ${42',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated template interpolation'
    );
  });

  test('rejects a canonical import that exists only in a comment', () => {
    const importStatement = [
      "// import rtlArchitecture from '@/config/rtlArchitecture.json';",
      "const rtlArchitecture = { marker: 'local-only' };",
    ].join('\n');
    const result = verifyFixture({
      rtlSource: buildRtlSource({ importStatement }),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config'
    );
  });

  test('rejects a root retention call that exists only in a comment', () => {
    const result = verifyFixture({
      rootSource:
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';\n// retainRtlArchitectureMarker();\n",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a root import inside a multiline template literal', () => {
    const result = verifyFixture({
      rootSource: [
        'const importEvidence = `',
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        '`;',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must import retainRtlArchitectureMarker from the RTL source'
    );
  });

  test('rejects a root retention call inside a multiline template literal', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const callEvidence = `',
        'retainRtlArchitectureMarker();',
        '`;',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a nested call after a regex literal containing a closing brace', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const closingBracePattern = /}/;',
        'function nestedRetention() {',
        '  retainRtlArchitectureMarker();',
        '}',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a fake retention call inside a regex after an if condition', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "if (true) /;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a fake retention call inside a regex after a while condition', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "while (false) /;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a fake retention call inside a regex after a for condition', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "for (; false; ) /;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a fake retention call inside a regex after a completed block', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'if (false) {}',
        "/;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a fake regex call after a semicolonless canonical root import', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl'",
        "/;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no qualifying root call was found');
  });

  test('rejects a fake regex call after export default', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'export default',
        "/;retainRtlArchitectureMarker();x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no qualifying root call was found');
  });

  test('rejects two genuine module-scope retention calls', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'multiple qualifying root calls were found'
    );
  });

  test('rejects duplicate genuine root calls separated by comments and whitespace', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'retainRtlArchitectureMarker();',
        '',
        '// Duplicate retention must not be accepted.',
        '/* Even when comments separate the calls. */',
        '',
        'retainRtlArchitectureMarker();',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'multiple qualifying root calls were found'
    );
  });

  test('rejects a fake call inside an ordinary regex with no real root call', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const evidence = /;retainRtlArchitectureMarker();x/;',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no qualifying root call was found');
  });

  test('keeps regex character classes with braces and fake identifiers opaque', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const evidencePattern = /[{}retainRtlArchitectureMarker]/;',
        'function nestedRetention() {',
        '  retainRtlArchitectureMarker();',
        '}',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('keeps escaped regex slashes, braces, and fake calls opaque', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "if (true) /escaped\\/\\}retainRtlArchitectureMarker\\(\\);x/.test('x');",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects regex fake-call evidence inside a real nested function', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'function nestedRetention() {',
        "  if (true) /;retainRtlArchitectureMarker();x/.test('x');",
        '}',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects fake root import-like text inside a control-condition regex', () => {
    const result = verifyFixture({
      rootSource:
        "if (true) /import \\{ retainRtlArchitectureMarker \\} from '@:lib:rtl'/.test('x');",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must import retainRtlArchitectureMarker from the RTL source'
    );
  });

  test('fails closed on an unterminated block comment', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        '/* unterminated',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated block comment'
    );
  });

  test('fails closed on an unterminated single-quoted string', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "const broken = 'unterminated",
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated quoted string'
    );
  });

  test('fails closed on an unterminated double-quoted string', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'const broken = "unterminated',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated quoted string'
    );
  });

  test('fails closed on an unterminated string line continuation', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        "const broken = 'unterminated" + '\\',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated quoted string'
    );
  });

  test('fails closed on an unterminated regex literal', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'if (true) /unterminated',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated regex literal'
    );
  });

  test('fails closed on an unterminated regex character class', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'if (true) /[unterminated',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unterminated regex character class'
    );
  });

  test('fails closed on unbalanced executable braces', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'if (true) {',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'app/_layout.tsx cannot be validated safely: unbalanced executable braces'
    );
  });

  test('rejects a retention call inside a function', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'function nestedRetention() {',
        '  retainRtlArchitectureMarker();',
        '}',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a retention call inside a conditional block', () => {
    const result = verifyFixture({
      rootSource: [
        "import { retainRtlArchitectureMarker } from '@/lib/rtl';",
        'if (true) {',
        '  retainRtlArchitectureMarker();',
        '}',
      ].join('\n'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Root layout must execute retainRtlArchitectureMarker() at module scope'
    );
  });

  test('rejects a dead standalone marker string without assignment', () => {
    const result = verifyFixture({
      retentionBody: `const deadMarker = '${CANONICAL_MARKER}';`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'must contain an executable globalThis retention assignment'
    );
  });

  test('scans screens for prohibited physical RTL styles', () => {
    const result = verifyFixture({
      screenSource: "const styles = { row: { flexDirection: 'row' } };\n",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'screens/FixtureScreen.tsx:1: raw flexDirection row'
    );
  });

  test('scans screens for escaped visible Hebrew', () => {
    const result = verifyFixture({
      screenSource: "export const label = '\\u05e9\\u05dc\\u05d5\\u05dd';\n",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'screens/FixtureScreen.tsx:1: visible Hebrew escape'
    );
  });

  test('scans index.js for prohibited native RTL bootstrap code', () => {
    const result = verifyFixture({
      indexSource:
        "const { I18nManager } = require('react-native');\nI18nManager.forceRTL(true);\n",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('index.js:1: native RTL manager');
  });

  test('fails when package main is not the RTL entrypoint', () => {
    const result = verifyFixture({ main: 'expo-router/entry' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('package.json main must be index.js');
  });

  test('keeps Android EAS builds behind the source verifier', () => {
    const wrapper = fs.readFileSync('scripts/eas-run.ps1', 'utf8');
    expect(wrapper).toContain('verify-rtl-build-source.mjs');
    expect(wrapper).toContain('--require-clean-git');
    expect(wrapper).toContain(
      "$platform -eq 'android' -or $platform -eq 'all'"
    );
  });
});
