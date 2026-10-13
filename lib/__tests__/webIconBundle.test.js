import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { createWebIconResolver } from '../../scripts/lib/web-icon-resolver.cjs';

describe('Web icon dependency boundary', () => {
  test('delegates Native and unrelated Web requests unchanged', () => {
    const calls = [];
    const context = {
      resolveRequest: (...args) => {
        calls.push(args);
        return 'original';
      },
    };
    const resolve = createWebIconResolver(
      undefined,
      '/web-icons.js',
      '/expo-icons.js'
    );
    for (const platform of ['ios', 'android']) {
      expect(resolve(context, 'lucide-react-native', platform)).toBe(
        'original'
      );
      expect(calls.at(-1)).toEqual([context, 'lucide-react-native', platform]);
      expect(resolve(context, '@expo/vector-icons', platform)).toBe('original');
      expect(calls.at(-1)).toEqual([context, '@expo/vector-icons', platform]);
    }
    expect(resolve(context, 'react-native-svg', 'web')).toBe('original');
    expect(resolve(context, 'lucide-react-native', 'web')).toEqual({
      type: 'sourceFile',
      filePath: '/web-icons.js',
    });
    expect(resolve(context, '@expo/vector-icons', 'web')).toEqual({
      type: 'sourceFile',
      filePath: '/expo-icons.js',
    });
    expect(resolve(context, '@expo/vector-icons/Ionicons', 'web')).toBe(
      'original'
    );
    const previous = (...args) => {
      calls.push(args);
      return 'custom';
    };
    expect(
      createWebIconResolver(previous, '/web-icons.js')(
        context,
        'lucide-react-native',
        'ios'
      )
    ).toBe('custom');
    expect(calls.at(-1)).toEqual([context, 'lucide-react-native', 'ios']);
  });

  test('every runtime icon import uses the identical upstream glyph without the full barrel', () => {
    const entry = readFileSync('lib/web-icons/lucide.web.js', 'utf8');
    const exports = new Map(
      [
        ...entry.matchAll(
          /export \{ default as (\w+) \} from '(lucide-react-native\/dist\/esm\/icons\/[^']+)';/g
        ),
      ].map((m) => [m[1], m[2]])
    );
    const upstream = readFileSync(
      'node_modules/lucide-react-native/dist/esm/lucide-react-native.js',
      'utf8'
    );
    const names = new Set();
    const fontNames = new Set();
    function scan(root) {
      for (const item of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, item.name);
        if (item.isDirectory()) {
          if (item.name !== '__tests__') scan(path);
          continue;
        }
        if (!/\.[jt]sx?$/.test(path)) continue;
        const ast = ts.createSourceFile(
          path,
          readFileSync(path, 'utf8'),
          ts.ScriptTarget.Latest,
          true
        );
        for (const statement of ast.statements) {
          if (
            !ts.isImportDeclaration(statement) ||
            !['lucide-react-native', '@expo/vector-icons'].includes(
              statement.moduleSpecifier.text
            )
          )
            continue;
          const clause = statement.importClause;
          if (clause?.isTypeOnly) continue;
          expect(clause?.name).toBeUndefined();
          expect(ts.isNamedImports(clause.namedBindings)).toBe(true);
          for (const element of clause.namedBindings.elements)
            if (!element.isTypeOnly)
              (statement.moduleSpecifier.text === 'lucide-react-native'
                ? names
                : fontNames
              ).add((element.propertyName ?? element.name).text);
        }
      }
    }
    for (const root of [
      'app',
      'components',
      'contexts',
      'hooks',
      'lib',
      'screens',
      'utils',
      'config',
    ])
      scan(root);
    expect([...names].sort()).toEqual([...exports.keys()].sort());
    expect([...fontNames]).toEqual(['Ionicons']);
    expect(readFileSync('lib/web-icons/expo.web.js', 'utf8')).toContain(
      "export { default as Ionicons } from '@expo/vector-icons/Ionicons';"
    );
    expect(
      readFileSync('node_modules/@expo/vector-icons/Ionicons.js', 'utf8')
    ).toContain("import Ionicons from './build/Ionicons';");
    expect(exports.size).toBeLessThan(60);
    for (const [name, path] of exports) {
      const relative = path.replace('lucide-react-native/dist/esm/', './');
      expect(upstream).toMatch(
        new RegExp(
          `export \\{[^}]*default as ${name}(?:,| \\})[^\\n]*from '${relative.replaceAll('.', '\\.')}';`
        )
      );
      expect(readFileSync(`node_modules/${path}`, 'utf8')).toContain(
        'createLucideIcon'
      );
    }
  });
});
